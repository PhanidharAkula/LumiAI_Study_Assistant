/**
 * VoicePlayer - turns a stream of reply text into natural speech with low
 * latency. Complete sentences are sent to text-to-speech as soon as they arrive
 * and their audio clips play back-to-back, so Lumi starts talking while the rest
 * of the reply is still being written and synthesized, instead of after one long
 * pause.
 *
 * Lifecycle: feed() text deltas as they stream, call finish() when the stream
 * ends, or cancel() to stop everything immediately (interrupt / mute / end).
 * onStart fires when the first clip begins playing; onEnd fires exactly once
 * when all queued speech has finished (never after a cancel()).
 */
type Synthesize = (text: string, signal: AbortSignal) => Promise<Blob>;

// A sentence terminator (incl. the ellipsis char), optional closing quotes or
// brackets, then whitespace - a sentence boundary we can safely split on while
// the rest is still streaming. Requiring trailing whitespace avoids cutting a
// decimal like "3.14" mid-number.
const SENTENCE = /^([\s\S]*?[.!?…]+["')\]]*)\s+([\s\S]*)$/;
// Hold sentences shorter than this so tiny fragments ("Sure.") merge with the
// next one instead of becoming their own choppy clip.
const MIN_SENTENCE = 16;

export class VoicePlayer {
  private buffer = "";
  private clips: Array<Promise<Blob | null>> = [];
  private nextIndex = 0;
  private streamEnded = false;
  private cancelled = false;
  private running = false;
  private ended = false;
  private wake: (() => void) | null = null;
  private ac = new AbortController();
  private startedFired = false;
  private stopCurrent: (() => void) | null = null;

  constructor(
    private synthesize: Synthesize,
    private onStart: () => void,
    private onEnd: () => void,
    // A single, shared <audio> element reused for every clip (instead of a fresh
    // `new Audio()` each time): iOS only lets an element play programmatically
    // after it's been "unlocked" inside a user gesture, so a new element per clip
    // is silently blocked by the mobile autoplay policy. The caller unlocks this
    // one inside the Begin tap.
    private audio: HTMLAudioElement
  ) {}

  /** Feed streamed reply text; complete sentences get queued for speech. */
  feed(textDelta: string): void {
    if (this.cancelled || this.streamEnded || !textDelta) return;
    this.buffer += textDelta;
    this.drain(false);
  }

  /** Speak one complete, already-known line as a single clip, then finish. Used
   *  for fixed lines (greeting, apology) so they aren't chopped into fragments. */
  sayLine(text: string): void {
    if (this.cancelled || this.streamEnded) return;
    this.enqueue(text.trim());
    this.streamEnded = true;
    this.wake?.();
    if (!this.running) this.finishOnce();
  }

  /** No more text is coming: flush the remainder and let playback finish. */
  finish(): void {
    if (this.cancelled || this.streamEnded) return;
    this.drain(true);
    this.streamEnded = true;
    this.wake?.();
    // Nothing was ever queued (e.g. empty reply): end right away.
    if (!this.running) this.finishOnce();
  }

  /** Stop immediately and release resources. Does NOT fire onEnd. */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.ended = true;
    this.streamEnded = true;
    try {
      this.ac.abort();
    } catch {
      /* ignore */
    }
    this.stopCurrent?.();
    this.stopCurrent = null;
    this.clips = [];
    this.wake?.();
  }

  private finishOnce(): void {
    if (this.ended) return;
    this.ended = true;
    this.onEnd();
  }

  private drain(flushAll: boolean): void {
    let m: RegExpExecArray | null;
    while ((m = SENTENCE.exec(this.buffer))) {
      const sentence = m[1]!.trim();
      if (sentence.length < MIN_SENTENCE && !flushAll) break;
      this.buffer = m[2]!;
      this.enqueue(sentence);
    }
    if (flushAll) {
      const rest = this.buffer.trim();
      this.buffer = "";
      this.enqueue(rest);
    }
  }

  private enqueue(sentence: string): void {
    if (!sentence) return;
    const clip = this.synthesize(sentence, this.ac.signal).catch(() => null);
    this.clips.push(clip);
    this.wake?.();
    if (!this.running) this.run();
  }

  private async run(): Promise<void> {
    this.running = true;
    while (!this.cancelled) {
      if (this.nextIndex >= this.clips.length) {
        if (this.streamEnded) break;
        // Wait for the next sentence (or finish()/cancel()).
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
        this.wake = null;
        continue;
      }
      const blob = await this.clips[this.nextIndex++];
      if (this.cancelled) break;
      if (blob) await this.playClip(blob);
    }
    this.running = false;
    if (!this.cancelled) this.finishOnce();
  }

  // Play one clip on the shared, pre-unlocked <audio> element (see constructor).
  // No Web Audio routing: that was the reliable, clip-free way to play; routing
  // through an AudioContext (for amplitude analysis) kept breaking playback on
  // Safari. Clips play strictly one at a time (the run loop awaits each), so
  // reusing the single element is safe.
  private playClip(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      const a = this.audio;
      const url = URL.createObjectURL(blob);
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        a.onplaying = null;
        a.onended = null;
        a.onerror = null;
        URL.revokeObjectURL(url);
        this.stopCurrent = null;
        resolve();
      };
      this.stopCurrent = () => {
        try {
          // Mute as well as pause: if End races a pending play() (a clip just
          // starting), `muted` persists so it stays silent even if that play()
          // resolves and briefly resumes (cleared again before the next clip).
          a.muted = true;
          a.pause();
        } catch {
          /* ignore */
        }
        done();
      };
      // Fire onStart when audio actually begins (not when the clip is queued), so
      // the talking animation starts exactly with the voice, not seconds early.
      a.onplaying = () => {
        if (!this.startedFired) {
          this.startedFired = true;
          this.onStart();
        }
      };
      a.onended = done;
      a.onerror = done;
      // Don't start a clip if we were cancelled between the run loop's check and
      // here (End pressed mid-setup).
      if (this.cancelled) {
        done();
        return;
      }
      a.muted = false; // clear any mute left by a previous stopCurrent
      a.src = url;
      a.play().catch(done);
    });
  }
}
