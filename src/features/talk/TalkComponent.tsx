import { useEffect, useState, useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import {
  fetchStreamingResponse,
  type ChatMessage,
} from "@shared/services/aiService";
import { fetchSpeech } from "@shared/services/ttsService";
import { VoicePlayer } from "./voicePlayer";
import {
  LumiStar,
  Starfield,
  UI,
  btnClass,
  starPath,
} from "@shared/components/atlas";
import { CloseButton } from "@shared/components/controls";
import { UsageBar } from "@shared/components/UsageBar";
import { keyPress, pressLift } from "@shared/motion";
import { useEscapeToClose, useScrollLock } from "@shared/hooks/overlay";

interface Props {
  isOpen?: boolean;
  onClose?: () => void;
}

// Round bottom control keys (mute / stop) on the night scene - hairline
// starlight circle by default; muted = filled starlight; stop = vermilion ink.
const TALK_BTN =
  "flex h-16.25 w-16.25 cursor-pointer items-center justify-center rounded-full border border-solid transition-colors duration-200 max-md:h-16 max-md:w-16 max-[480px]:h-14 max-[480px]:w-14";
const TALK_BTN_RED =
  "border-[#e2674a]/60 bg-transparent text-[#ff9c82] hover:border-[#e2674a] hover:bg-[#b23a1d] hover:text-starlight";
const TALK_BTN_DEFAULT =
  "border-starlight/30 bg-transparent text-starlight hover:border-starlight/70 hover:bg-starlight/10";
const TALK_BTN_MUTED = "border-starlight bg-starlight text-ink";

// Neural voices exposed in the picker. The server validates against its own
// allow-list, so this is just the friendly subset students choose from.
const TTS_VOICES = [
  { id: "nova", label: "Nova" },
  { id: "shimmer", label: "Shimmer" },
  { id: "coral", label: "Coral" },
  { id: "sage", label: "Sage" },
  { id: "alloy", label: "Alloy" },
  { id: "echo", label: "Echo" },
  { id: "fable", label: "Fable" },
  { id: "onyx", label: "Onyx" },
];
const DEFAULT_TTS_VOICE = "nova";

// Cap the in-memory history so a long session doesn't resend an ever-growing
// transcript every turn. Keeps the last ~10 exchanges, plenty for a spoken chat.
const MAX_HISTORY = 20;

// Spoken when a conversation starts. Pre-fetched while the start screen is up so
// Begin plays instantly (see greetingRef).
const GREETINGS = [
  "Hi! What can I help you with?",
  "Hello! How can I assist you today?",
  "Hey! What would you like to know?",
  "Hi there! What can I do for you?",
];

// A beat between the mic-start chime and Lumi's first words, so they don't run
// together right after Begin.
const GREETING_DELAY_MS = 1000;

// A tiny silent WAV (built once) used to "unlock" the shared audio element inside
// the Begin tap on iOS/mobile, where programmatic audio is otherwise blocked
// unless the element was first played from a user gesture.
let _silentUrl = "";
const silentClipUrl = (): string => {
  if (_silentUrl) return _silentUrl;
  const sampleRate = 8000;
  const samples = 800; // ~0.1s
  const buf = new ArrayBuffer(44 + samples);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); // 8-bit
  writeStr(36, "data");
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128); // 8-bit silence
  _silentUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return _silentUrl;
};

// Mobile browsers (notably iOS) block programmatic audio outside a user gesture,
// so ONLY on mobile do we play through one shared <audio> element unlocked on the
// Begin tap. Desktop has no such restriction and keeps the original per-clip
// playback untouched.
const IS_MOBILE =
  typeof navigator !== "undefined" &&
  (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches));

// Talk is a general spoken conversation - deliberately not grounded in any
// class's materials (that's what the chat page with file tagging is for).
const TalkComponent = ({ isOpen = true, onClose = () => {} }: Props) => {
  // Restore the saved voice synchronously so the first render (and the greeting
  // pre-fetch) already use it - avoids a wasted pre-fetch for the default voice.
  const [voiceIndex, setVoiceIndex] = useState(() => {
    try {
      const saved = localStorage.getItem("lumiTalkVoiceIndex");
      const parsed = saved !== null ? parseInt(saved, 10) : NaN;
      return Number.isInteger(parsed) &&
        parsed >= 0 &&
        parsed < TTS_VOICES.length
        ? parsed
        : 0;
    } catch {
      return 0;
    }
  });
  const [started, setStartedState] = useState(false);
  const [speaking, setSpeakingState] = useState(false);
  const [thinking, setThinkingState] = useState(false);
  const [muted, setMutedState] = useState(false);
  // MOBILE push-to-talk: true while the mic records the user's turn. Desktop is
  // hands-free and doesn't use this; "Tap to speak" (idle) is derived from it.
  const [listening, setListeningState] = useState(false);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  // Surfaced on the start screen when voice can't run (mic denied / unsupported).
  const [notice, setNotice] = useState<string | null>(null);

  // Speech-to-text (input) still uses the Web Speech API; only the voice OUTPUT
  // is neural now, played through the VoicePlayer below.
  const recognitionRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationHistoryRef = useRef<ChatMessage[]>([]);
  const playerRef = useRef<VoicePlayer | null>(null);
  // One shared <audio> element for all neural-voice playback, unlocked inside the
  // Begin tap (startConversation) so mobile autoplay can't block Lumi's voice.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // Greeting audio pre-fetched while the start screen is up, so Begin plays it
  // instantly instead of waiting on a cold TTS call (also warms the TTS path for
  // the first real reply).
  const greetingRef = useRef<{
    text: string;
    voice: string;
    audio: Promise<Blob>;
  } | null>(null);
  // Whether the opening greeting has been spoken this session. It's spoken once,
  // from recognition.onstart, so it lands AFTER the mic-permission prompt.
  const greetedRef = useRef(false);
  // True from mic-permission grant until the greeting finishes, so a user who
  // talks during the pre-greeting beat doesn't start a turn the greeting cancels.
  const greetingPendingRef = useRef(false);
  // The pending greeting timer, so End/Begin/unmount can cancel a greeting that
  // hasn't fired yet - otherwise a stale timer could speak after the session
  // changed (e.g. greeting playing right after End).
  const greetingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The star's scale, driven by a smoothed pulse while Lumi speaks.
  const starScale = useMotionValue(1);
  const smoothStar = useSpring(starScale, {
    stiffness: 170,
    damping: 16,
    mass: 0.7,
  });
  // Wrapper around the voice trigger + dropdown, for outside-click detection.
  const voiceMenuWrapRef = useRef<HTMLDivElement>(null);

  // The Web Speech callbacks (recognition onresult/onend) are bound once when
  // recognition is created, so they capture whatever started/muted/speaking were
  // at that instant and never see later updates. Mirror those flags into refs we
  // update synchronously and read from inside the callbacks, so auto-restart and
  // stop always act on the live values. The setX helpers keep ref + state in
  // lockstep, so every existing setStarted/setMuted/setSpeaking call still works.
  const startedRef = useRef(false);
  const mutedRef = useRef(false);
  const speakingRef = useRef(false);
  // Mirror of `thinking` so the recognition callback can tell, synchronously,
  // when it's the user's turn (we ignore audio captured while Lumi thinks or
  // speaks - logical half-duplex with the mic kept physically open).
  const thinkingRef = useRef(false);
  // Set just before a deliberate recognition.stop() (turn handoff, mute, end) so
  // onend knows the end was intentional and skips its auto-restart; an
  // involuntary end (silence/network timeout) leaves it false.
  const intentionalStopRef = useRef(false);
  // MOBILE push-to-talk: the mic is recording the user's turn right now.
  const listeningRef = useRef(false);
  // MOBILE: whether the current push-to-talk turn captured any speech, so onend
  // tells a real turn (now off to the AI) from an empty tap (back to idle).
  const gotResultRef = useRef(false);

  const setStarted = (v: boolean) => {
    startedRef.current = v;
    setStartedState(v);
  };
  const setMuted = (v: boolean) => {
    mutedRef.current = v;
    setMutedState(v);
  };
  const setSpeaking = (v: boolean) => {
    speakingRef.current = v;
    setSpeakingState(v);
  };
  const setThinking = (v: boolean) => {
    thinkingRef.current = v;
    setThinkingState(v);
  };
  const setListening = (v: boolean) => {
    listeningRef.current = v;
    setListeningState(v);
  };

  // Speech-to-text isn't in every browser (notably Safari/iOS and Firefox). Gate
  // the start screen on it so the feature fails up front with a clear message
  // instead of greeting the user and then breaking.
  const recognitionSupported =
    typeof window !== "undefined" &&
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );

  const currentVoiceId = () => TTS_VOICES[voiceIndex]?.id || DEFAULT_TTS_VOICE;

  // Stop the mic deliberately and mark the stop intentional so onend won't
  // auto-restart it. Used for the turn handoff (mic off while Lumi replies),
  // mute, and ending the conversation.
  const stopListening = () => {
    if (!recognitionRef.current) return;
    intentionalStopRef.current = true;
    try {
      recognitionRef.current.stop();
    } catch {}
    recognitionRef.current = null;
  };

  // Append a turn and trim to the most recent MAX_HISTORY messages.
  const pushHistory = (msg: ChatMessage) => {
    const h = conversationHistoryRef.current;
    h.push(msg);
    if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);
  };

  // Cleanup on unmount or page refresh
  useEffect(() => {
    return () => {
      // Mark inactive first so a recognition onend firing during teardown can't
      // auto-restart the mic after the component is gone.
      startedRef.current = false;
      if (greetingTimerRef.current) clearTimeout(greetingTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        } catch {}
      }
      playerRef.current?.cancel();
      playerRef.current = null;
      try {
        audioElRef.current?.pause();
      } catch {}
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Drive the centre star: a lively layered-sine pulse while speaking, a gentle
  // breath while thinking, otherwise rest at 1. Runs on rAF and writes a motion
  // value, so it never re-renders React. (Not amplitude-driven - routing audio
  // through Web Audio to read amplitude broke playback on Safari.)
  useEffect(() => {
    let raf = 0;
    if (speaking) {
      // A lively, organic pulse while Lumi speaks - layered sines so it doesn't
      // look mechanical. Capped modestly so it can't reach the status text.
      const t0 = performance.now();
      const loop = () => {
        const p = (performance.now() - t0) / 1000;
        const a = 0.5 + 0.5 * Math.sin(p * 7.5);
        const b = 0.5 + 0.5 * Math.sin(p * 11.5 + 1.3);
        starScale.set(1 + 0.13 * (0.62 * a + 0.38 * b));
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else if (thinking || listening) {
      const t0 = performance.now();
      const loop = () => {
        const p = (performance.now() - t0) / 1000;
        starScale.set(1 + 0.045 * (0.5 + 0.5 * Math.sin(p * 3)));
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else {
      starScale.set(1);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [speaking, thinking, listening, starScale]);

  // Pre-fetch (and thereby warm) the greeting audio while the user is on the
  // start screen, so clicking Begin plays it without a cold TTS round-trip.
  useEffect(() => {
    if (started || !recognitionSupported) return;
    const voice = TTS_VOICES[voiceIndex]?.id || DEFAULT_TTS_VOICE;
    if (greetingRef.current?.voice === voice) return;
    const text = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]!;
    // Store the in-flight promise (not just the resolved blob) so the greeting
    // can await this single fetch even if Begin is clicked before it finishes -
    // it never falls back to a second, slower fetch.
    const audio = fetchSpeech(text, voice);
    audio.catch(() => {});
    greetingRef.current = { text, voice, audio };
  }, [started, voiceIndex, recognitionSupported]);

  // Outside-click dismissal is handled by a scrim (dismiss-only / swallowed),
  // matching the rest of the app's dropdowns. Escape closes the whole overlay.

  const openVoiceMenu = () => setVoiceMenuOpen((v) => !v);
  const selectVoice = (i: number) => {
    setVoiceIndex(i);
    setVoiceMenuOpen(false);
    localStorage.setItem("lumiTalkVoiceIndex", i.toString());
  };

  // Build a neural-voice player wired to the shared speaking lifecycle: it stops
  // the mic-off "thinking" state when the first audio plays, and reopens the mic
  // once all speech finishes (half-duplex - the mic is closed while Lumi talks
  // so it never hears itself).
  const makePlayer = () => {
    // Mobile plays through the one shared, gesture-unlocked element; desktop omits
    // it and VoicePlayer uses a fresh Audio() per clip (original behaviour).
    const el = IS_MOBILE
      ? (audioElRef.current ?? (audioElRef.current = new Audio()))
      : undefined;
    const player: VoicePlayer = new VoicePlayer(
      (sentence, signal) => {
        // Reuse the single pre-fetched greeting request if this line is it
        // (resolved -> instant; still in flight -> just await it, no 2nd fetch).
        const g = greetingRef.current;
        if (g && g.text === sentence && g.voice === currentVoiceId()) {
          greetingRef.current = null;
          return g.audio;
        }
        return fetchSpeech(sentence, currentVoiceId(), signal);
      },
      () => {
        // First clip is playing.
        setThinking(false);
        setSpeaking(true);
      },
      () => {
        // All speech finished. The continuous mic is normally still running;
        // start it only if it isn't (the first turn after the greeting, or a
        // timeout that slipped through). onEnd always fires (even if a clip
        // failed), so it's the safe place to clear the pre-greeting guard.
        greetingPendingRef.current = false;
        setSpeaking(false);
        setThinking(false);
        if (playerRef.current === player) playerRef.current = null;
        // Desktop keeps the continuous mic alive across turns; mobile push-to-talk
        // returns to idle ("Tap to speak") and waits for the next tap (setting
        // listening false above leaves the derived idle state showing).
        if (
          !IS_MOBILE &&
          startedRef.current &&
          !mutedRef.current &&
          !recognitionRef.current
        ) {
          startListening();
        }
      },
      el
    );
    return player;
  };

  // Speak a single fixed line (greeting, apology) in the neural voice.
  const speakLine = (text: string) => {
    playerRef.current?.cancel();
    const player = makePlayer();
    playerRef.current = player;
    player.sayLine(text);
  };

  // Speak the opening greeting (prefers the pre-fetched clip). Called once mic
  // permission is granted (recognition.onstart) so Lumi greets after the prompt.
  const speakGreeting = () => {
    const voice = currentVoiceId();
    const greeting =
      greetingRef.current?.voice === voice
        ? greetingRef.current.text
        : GREETINGS[Math.floor(Math.random() * GREETINGS.length)]!;
    conversationHistoryRef.current = [{ role: "assistant", content: greeting }];
    speakLine(greeting);
  };

  // The mic runs continuously for the whole session (started once, stopped only
  // on mute / end), so we never start/stop it per turn - that repeated open/close
  // is what makes the system's mic chimes ("tic"/"tac"). Instead we ignore audio
  // captured while Lumi is thinking or speaking (logical half-duplex).
  const startListening = () => {
    if (mutedRef.current || recognitionRef.current) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStarted(false);
      setNotice("Voice conversations aren't supported in this browser.");
      return;
    }

    const r: any = new SpeechRecognition();
    r.lang = "en-US";
    // We only act on final transcripts, so skip interim events entirely.
    r.interimResults = false;
    r.continuous = true;
    r.maxAlternatives = 1;
    // Scoped to this session so a stale error from a recognition we've already
    // replaced can't bleed into the next one's restart decision.
    let lastError = "";

    r.onstart = () => {
      // Mic permission is granted and we're live. Greet once, after a short beat
      // so the greeting doesn't run into the mic-start chime. Block input during
      // the beat so an eager user's words don't start a turn the greeting cancels.
      if (greetedRef.current) return;
      greetedRef.current = true;
      greetingPendingRef.current = true;
      greetingTimerRef.current = setTimeout(() => {
        greetingTimerRef.current = null;
        if (startedRef.current && !mutedRef.current) speakGreeting();
        else greetingPendingRef.current = false;
      }, GREETING_DELAY_MS);
    };

    r.onresult = (ev: any) => {
      // Act only on the user's turn; ignore anything captured while Lumi is
      // thinking or speaking, or during the pre-greeting beat.
      if (
        thinkingRef.current ||
        speakingRef.current ||
        greetingPendingRef.current
      )
        return;
      const last = ev.results[ev.results.length - 1];
      if (last.isFinal) {
        const text = last[0].transcript.trim();
        if (text) {
          pushHistory({ role: "user", content: text });
          sendToAI(text);
        }
      }
    };

    r.onerror = (e: any) => {
      lastError = e?.error || "";
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.error("Speech recognition error:", e);
      }
    };

    r.onend = () => {
      // Ignore the tail of a session we've already replaced.
      if (recognitionRef.current && recognitionRef.current !== r) return;
      // Free the handle so the restart below isn't blocked by its own guard.
      recognitionRef.current = null;
      const wasIntentional = intentionalStopRef.current;
      intentionalStopRef.current = false;
      // A missing/denied mic is fatal - restarting would just spin - so drop out
      // and say why.
      if (
        lastError === "not-allowed" ||
        lastError === "service-not-allowed" ||
        lastError === "audio-capture"
      ) {
        setStarted(false);
        setNotice(
          lastError === "audio-capture"
            ? "No microphone found. Connect one and tap Begin again."
            : "Lumi needs microphone access for voice. Allow it in your browser settings, then tap Begin again."
        );
        return;
      }
      // A deliberate stop (mute / end) is final; otherwise keep the continuous
      // mic alive across Chrome's silence/network timeouts. Reads refs, not
      // captured state, so it always sees the live values.
      if (wasIntentional) return;
      if (startedRef.current && !mutedRef.current) {
        setTimeout(() => startListening(), 100);
      }
    };

    recognitionRef.current = r;
    try {
      r.start();
    } catch (e) {
      console.error("Error starting recognition:", e);
      recognitionRef.current = null;
    }
  };

  // MOBILE push-to-talk: capture ONE spoken turn, started from a tap (the user
  // gesture iOS needs). continuous=false so it auto-ends on silence, and the mic
  // is never open while Lumi speaks (which on iOS would break the next turn).
  const startPushToTalkTurn = () => {
    if (recognitionRef.current) return;
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStarted(false);
      setNotice("Voice conversations aren't supported in this browser.");
      return;
    }
    const r: any = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = false;
    r.continuous = false; // one utterance, auto-ends on silence
    r.maxAlternatives = 1;
    let lastError = "";
    gotResultRef.current = false;

    r.onresult = (ev: any) => {
      const last = ev.results[ev.results.length - 1];
      if (last.isFinal) {
        const text = last[0].transcript.trim();
        if (text) {
          gotResultRef.current = true;
          setListening(false);
          pushHistory({ role: "user", content: text });
          sendToAI(text);
        }
      }
    };

    r.onerror = (e: any) => {
      lastError = e?.error || "";
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.error("Speech recognition error:", e);
      }
    };

    r.onend = () => {
      if (recognitionRef.current === r) recognitionRef.current = null;
      intentionalStopRef.current = false;
      setListening(false);
      // A missing/denied mic is fatal - stop and explain.
      if (
        lastError === "not-allowed" ||
        lastError === "service-not-allowed" ||
        lastError === "audio-capture"
      ) {
        setStarted(false);
        setNotice(
          lastError === "audio-capture"
            ? "No microphone found. Connect one and tap to speak again."
            : "Lumi needs microphone access for voice. Allow it in your browser settings, then tap to speak."
        );
        return;
      }
      // No speech captured (silence / a quick tap) just returns to idle; a real
      // turn already went to the AI from onresult, so nothing else to do.
    };

    recognitionRef.current = r;
    try {
      r.start();
      setListening(true);
    } catch (e) {
      console.error("Error starting recognition:", e);
      recognitionRef.current = null;
      setListening(false);
    }
  };

  // MOBILE: the central star is the push-to-talk control - tap when idle to
  // speak, tap while listening to send what was captured.
  const onMobileMic = () => {
    if (!startedRef.current) return;
    if (listeningRef.current) {
      stopListening(); // finalize: onresult (if any) -> onend
    } else if (!speakingRef.current && !thinkingRef.current) {
      startPushToTalkTurn();
    }
  };

  const sendToAI = async (userText: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    playerRef.current?.cancel();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    const player = makePlayer();
    playerRef.current = player;
    setThinking(true);

    try {
      // Stream the reply and speak it sentence-by-sentence as it arrives, so Lumi
      // starts talking quickly instead of after the whole reply is generated.
      const result = await fetchStreamingResponse(
        userText,
        "",
        (token) => player.feed(token),
        ac.signal,
        conversationHistoryRef.current,
        [],
        { mode: "voice" }
      );

      // Superseded or stopped: the interrupting action owns the cleanup.
      if (result.errorType === "aborted") {
        player.cancel();
        return;
      }

      if (result.text && result.text.trim()) {
        pushHistory({ role: "assistant", content: result.text });
        player.finish(); // plays the remainder, then onEnd reopens the mic
      } else {
        player.cancel();
        setThinking(false);
        // Drop the user turn that got no reply so history stays alternating.
        const h = conversationHistoryRef.current;
        if (h.length && h[h.length - 1]!.role === "user") h.pop();
        if (result.error) {
          speakLine(
            "Sorry, I'm having trouble responding right now. Please try again in a moment."
          );
        } else if (!IS_MOBILE && startedRef.current && !mutedRef.current) {
          // Desktop reopens the continuous mic; mobile returns to idle (tap to speak).
          startListening();
        }
      }
    } catch (e) {
      player.cancel();
      setThinking(false);
      if (!(e instanceof Error) || e.name !== "AbortError") {
        console.error("Error getting AI response:", e);
        if (!IS_MOBILE && startedRef.current && !mutedRef.current)
          startListening();
      }
    } finally {
      if (abortControllerRef.current === ac) abortControllerRef.current = null;
    }
  };

  const startConversation = () => {
    setNotice(null);
    // MOBILE: unlock audio output INSIDE this tap so Lumi's greeting + replies
    // (which play later, from a timer and the streaming callback) are allowed on
    // iOS/mobile, where programmatic audio is blocked unless first played from a
    // user gesture. Desktop has no such restriction and is left untouched.
    if (IS_MOBILE) {
      try {
        const el = audioElRef.current ?? (audioElRef.current = new Audio());
        el.muted = true;
        el.src = silentClipUrl();
        const p = el.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            el.pause();
            el.muted = false;
          }).catch(() => {
            el.muted = false;
          });
        } else {
          el.muted = false;
        }
      } catch {
        /* ignore */
      }
    }
    if (greetingTimerRef.current) {
      clearTimeout(greetingTimerRef.current);
      greetingTimerRef.current = null;
    }
    greetedRef.current = false;
    greetingPendingRef.current = false;
    setStarted(true);
    if (IS_MOBILE) {
      // Push-to-talk: greet now (audio was unlocked in this tap), then wait for a
      // tap to speak. Mic permission is requested on the FIRST tap-to-speak, not
      // here - so playback (the greeting) never fights an open mic on iOS.
      greetedRef.current = true; // greeting handled here, not from recognition.onstart
      setListening(false);
      speakGreeting();
    } else {
      // Desktop: hands-free. Start the mic now (the permission prompt appears on
      // this tap); the greeting speaks from recognition.onstart after the user
      // allows. A denial is handled in recognition.onerror.
      startListening();
    }
  };

  const handleStop = () => {
    // Mark inactive first so the recognition's onend (fired by stop() below)
    // sees a dead conversation and doesn't auto-restart the mic.
    setStarted(false);
    stopListening();
    if (greetingTimerRef.current) {
      clearTimeout(greetingTimerRef.current);
      greetingTimerRef.current = null;
    }
    greetingPendingRef.current = false;
    playerRef.current?.cancel();
    playerRef.current = null;
    try {
      audioElRef.current?.pause();
    } catch {}
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setSpeaking(false);
    setThinking(false);
    conversationHistoryRef.current = [];
  };

  const toggleMute = () => {
    const newMuted = !mutedRef.current;
    setMuted(newMuted);

    if (newMuted) {
      // setMuted set mutedRef synchronously above; stopListening marks the stop
      // intentional (onend won't restart) and frees the handle for a later
      // unmute. Lumi finishes its current line; the mic just won't reopen.
      stopListening();
    } else if (startedRef.current && !speakingRef.current) {
      // Only reopen now if Lumi isn't mid-reply; otherwise its onEnd reopens it.
      startListening();
    }
  };

  // Dismiss the whole talk overlay - stop any in-flight speech/recognition,
  // then hand control back to the caller. Shared by the header ✕ and Escape.
  const handleClose = () => {
    handleStop();
    onClose();
  };

  // Lock background scroll while the fullscreen night scene is open and let
  // Escape leave it (routed through the same stop+close path), both via the
  // shared overlay hooks so this stacks with any dialog above it.
  useScrollLock(isOpen);
  useEscapeToClose(isOpen, handleClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-talk)] flex flex-col overflow-hidden bg-night">
      <Starfield count={70} seed={11} />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% 110%, rgb(199 154 51 / 0.12), transparent 60%)",
        }}
      />
      <div className="fixed inset-x-0 top-0 z-1210 flex items-center justify-between bg-transparent p-7.5 max-md:p-5 max-[480px]:px-5 max-[480px]:py-4">
        <div className="flex items-center gap-2.5">
          {!started && (
            <div ref={voiceMenuWrapRef} className="relative">
              <motion.button
                type="button"
                className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-solid border-starlight/30 bg-transparent px-4 text-starlight transition-colors duration-200 hover:border-starlight/70 hover:bg-starlight/10 max-md:h-9 max-[480px]:px-3"
                title={TTS_VOICES[voiceIndex]?.label || "Change voice"}
                aria-label="Change voice"
                onClick={openVoiceMenu}
                {...keyPress}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                </svg>
                <span className="max-w-30 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] tracking-wide">
                  {TTS_VOICES[voiceIndex]?.label || "Voice"}
                </span>
              </motion.button>
              {/* Outside-click scrim: dismiss-only (swallows the click). */}
              {voiceMenuOpen && (
                <div
                  className="fixed inset-0 z-1390 bg-transparent"
                  onClick={() => setVoiceMenuOpen(false)}
                />
              )}
              {voiceMenuOpen && (
                <motion.div
                  className="absolute left-0 top-14.5 z-1400 max-h-[60vh] min-w-60 overflow-y-auto rounded-xl border border-solid border-line-night bg-night-2 shadow-night"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {TTS_VOICES.map((v, i) => (
                    <motion.button
                      key={v.id}
                      type="button"
                      className={`flex w-full cursor-pointer items-center gap-2.5 border-0 border-l-2 border-solid px-4 py-3 text-left font-mono text-[12.5px] transition-colors duration-200 ${
                        i === voiceIndex
                          ? "border-gold/50 bg-gold/10 font-semibold text-gold"
                          : "border-transparent bg-transparent text-starlight/85 hover:bg-starlight/7"
                      }`}
                      onClick={() => selectVoice(i)}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span
                        aria-hidden="true"
                        className={`text-[11px] text-gold ${
                          i === voiceIndex ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        ✦
                      </span>
                      {v.label}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </div>
          )}
          <UsageBar variant="night" />
        </div>
        <div className="flex items-center gap-2.5">
          <CloseButton
            variant="night"
            label="Close voice conversation"
            onClick={handleClose}
          />
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-5 pt-20 pb-10">
        {!started ? (
          <div className="flex flex-col items-center gap-4.5 text-center">
            <motion.div
              className="text-starlight/35"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <LumiStar
                size={110}
                orbit
                breathe
                core="var(--color-night)"
                className="max-md:h-20 max-md:w-20"
              />
            </motion.div>
            <p className={`m-0 ${UI.overlineNight}`}>
              The observatory is listening
            </p>
            <h3 className="m-0 font-display text-[28px] font-semibold leading-tight text-starlight max-md:text-[24px]">
              Talk with AI
            </h3>
            {recognitionSupported ? (
              <>
                <p className="m-0 text-[16px] leading-[1.6] text-starlight/60 max-md:text-[14px]">
                  Start a natural voice conversation
                </p>
                {notice && (
                  <p className="m-0 max-w-sm text-[13.5px] leading-[1.6] text-[#ff9c82]">
                    {notice}
                  </p>
                )}
                <motion.button
                  type="button"
                  className={`${btnClass("gold")} mt-3`}
                  onClick={startConversation}
                  {...pressLift}
                >
                  <span aria-hidden="true" className="text-[13px]">
                    ✦
                  </span>
                  Begin
                </motion.button>
              </>
            ) : (
              <p className="m-0 max-w-sm text-[15px] leading-[1.65] text-starlight/60 max-md:text-[14px]">
                Voice conversations need a browser with speech recognition. Try
                Lumi in Chrome on desktop or Android, or use the chat instead.
              </p>
            )}
          </div>
        ) : (
          <div className="flex h-full w-full max-w-150 flex-col items-center justify-center gap-16 max-md:gap-10">
            <motion.div
              className={`relative h-62.5 w-62.5 max-md:h-52.5 max-md:w-52.5 max-[480px]:h-45 max-[480px]:w-45${
                IS_MOBILE && !speaking && !thinking ? " cursor-pointer" : ""
              }`}
              style={{ scale: smoothStar }}
              onClick={IS_MOBILE ? onMobileMic : undefined}
              role={IS_MOBILE ? "button" : undefined}
              aria-label={
                IS_MOBILE
                  ? listening
                    ? "Tap to send"
                    : "Tap to speak"
                  : undefined
              }
            >
              {/* Outer soft halo */}
              <div
                className="pointer-events-none absolute -inset-10 rounded-full"
                aria-hidden="true"
                style={{
                  background:
                    "radial-gradient(rgb(199 154 51 / 0.35), transparent 70%)",
                }}
              />
              {/* Slow orbit ring with a tiny star riding it */}
              <svg
                viewBox="0 0 100 100"
                className="absolute inset-0 h-full w-full text-starlight/40"
                aria-hidden="true"
              >
                <g
                  className="animate-orbit"
                  style={{ transformOrigin: "50px 50px" }}
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="47"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.6"
                    strokeDasharray="0.5 5.5"
                    strokeLinecap="round"
                    opacity="0.7"
                  />
                  <path d={starPath(97, 50, 2.6)} fill="var(--color-gold)" />
                </g>
              </svg>
              {/* The star core - long + short rays, bright starlight heart */}
              <svg
                viewBox="0 0 100 100"
                className="relative h-full w-full"
                aria-hidden="true"
                style={{
                  filter: "drop-shadow(0 0 18px rgb(199 154 51 / 0.45))",
                }}
              >
                <g
                  className="animate-breathe"
                  style={{ transformOrigin: "50px 50px" }}
                >
                  <path
                    d={starPath(50, 50, 25)}
                    transform="rotate(45 50 50)"
                    fill="var(--color-gold)"
                    opacity="0.65"
                  />
                  <path d={starPath(50, 50, 37)} fill="var(--color-gold)" />
                  <circle
                    cx="50"
                    cy="50"
                    r="11"
                    fill="var(--color-starlight)"
                    opacity="0.3"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="6.5"
                    fill="var(--color-starlight)"
                  />
                </g>
              </svg>
            </motion.div>
            <div className="flex flex-col items-center gap-2.5 text-center">
              <p
                role="status"
                aria-live="polite"
                className="m-0 font-mono text-[12px] font-medium uppercase tracking-[0.32em] text-gold"
              >
                {speaking
                  ? "Speaking…"
                  : thinking
                    ? "Thinking…"
                    : IS_MOBILE
                      ? listening
                        ? "Listening…"
                        : "Tap to speak"
                      : muted
                        ? "Muted"
                        : "Listening…"}
              </p>
              <p className="m-0 text-[14px] text-starlight/60 max-[480px]:text-[13px]">
                {IS_MOBILE ? (
                  speaking || thinking ? (
                    <>One moment…</>
                  ) : listening ? (
                    <>Listening… tap the star to send.</>
                  ) : (
                    <>Tap the star, then speak.</>
                  )
                ) : muted ? (
                  <>Microphone off - unmute to continue.</>
                ) : (
                  <>Speak whenever you&rsquo;re ready.</>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {started && (
        <div className="fixed bottom-10 left-1/2 z-1220 flex -translate-x-1/2 items-center justify-center gap-8 max-md:bottom-[calc(30px+env(safe-area-inset-bottom))] max-md:gap-6 max-[480px]:bottom-[calc(24px+env(safe-area-inset-bottom))] max-[480px]:gap-5">
          {/* Mute is desktop-only: mobile push-to-talk isn't continuously
              listening, so there's nothing to mute (the star is the mic). */}
          {!IS_MOBILE && (
            <motion.button
              type="button"
              className={`${TALK_BTN} ${muted ? TALK_BTN_MUTED : TALK_BTN_DEFAULT}`}
              title={muted ? "Unmute" : "Mute"}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              onClick={toggleMute}
              {...keyPress}
            >
            {muted ? (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            ) : (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            )}
          </motion.button>
          )}
          <motion.button
            type="button"
            className={`${TALK_BTN} ${TALK_BTN_RED}`}
            title="End conversation"
            aria-label="End conversation"
            onClick={handleStop}
            {...keyPress}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </motion.button>
        </div>
      )}
    </div>
  );
};

export default TalkComponent;
