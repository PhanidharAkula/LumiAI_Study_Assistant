/**
 * Vercel serverless function - text-to-speech proxy.
 *
 * Turns Lumi's spoken replies into natural audio. The provider key lives only on
 * the server; the browser receives audio bytes, never the key or the provider's
 * name. Auth-gated like /api/chat so it can't be called anonymously to burn
 * credits. All copy stays on-brand ("Lumi"), never naming the upstream service.
 */
import { getAuthedUser } from "./_auth.js";
import { rateLimit } from "./_ratelimit.js";

const TTS_KEY = process.env.LUMI_TTS_KEY || "";
// tts-1 is low-latency and consistent run-to-run (best for a back-and-forth
// conversation). gpt-4o-mini-tts is more expressive but re-renders the voice a
// little differently each time; tts-1-hd is higher quality but slower.
const TTS_MODEL = process.env.LUMI_TTS_MODEL || "tts-1";
const TTS_ENDPOINT = "https://api.openai.com/v1/audio/speech";

// Per-user fair-use limits: a generous DAILY budget plus a per-minute burst
// guard. Speech is synthesized per sentence, so both are higher than chat.
// Override via env; set BURST to 0 to disable the burst check.
const TTS_DAILY = Number(process.env.LUMI_TTS_DAILY) || 600;
const TTS_BURST = Number(process.env.LUMI_TTS_BURST ?? 60);

// Bound spoken text so one request can't run up a large bill.
const MAX_TTS_CHARS = 2000;

// The voices we expose; anything else falls back to the default.
const ALLOWED_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
];
const DEFAULT_VOICE = "nova";

// Steer the steerable models toward a warm, human tutor delivery.
const TONE =
  "Speak like a warm, friendly tutor: natural, relaxed, and lightly encouraging.";

// Natural pace for tts-1 / tts-1-hd. Their `speed` is deterministic and
// pitch-preserving, unlike a client-side playbackRate (unreliable on Safari).
// 1.0 is the natural narration rate; >1 reads rushed and amplifies the
// clip-to-clip prosody variation of sentence-by-sentence streaming. Optional
// LUMI_TTS_SPEED env override so the pace can be tuned without a redeploy.
const envSpeed = Number(process.env.LUMI_TTS_SPEED);
const TTS_SPEED = Number.isFinite(envSpeed) && envSpeed > 0 ? envSpeed : 1.0;

function sendJson(res: any, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

// Bound the body so a client can't buffer a huge payload (the text is sliced to
// MAX_TTS_CHARS anyway). A spoken line is tiny; 1 MB is very generous.
const MAX_BODY_BYTES = 1024 * 1024;

async function readBody(req: any): Promise<any> {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    if (req.body.length > MAX_BODY_BYTES) throw new Error("Request body too large");
    return req.body.length ? JSON.parse(req.body) : {};
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (!TTS_KEY) {
    // Config problem - log for ops, stay generic for the client.
    console.error("[tts] LUMI_TTS_KEY is not configured");
    return sendJson(res, 503, { error: "Voice is temporarily unavailable." });
  }

  const auth = await getAuthedUser(req);
  if (!auth.ok) {
    return sendJson(res, auth.status, {
      error:
        auth.status === 401
          ? "Please sign in to use Lumi."
          : "Voice is temporarily unavailable.",
    });
  }

  // Per-user rate limit (no-op until a KV store is configured; fails open).
  const rl = await rateLimit("tts", auth.userId, {
    perDay: TTS_DAILY,
    perMin: TTS_BURST,
  });
  if (!rl.ok) {
    return sendJson(res, 429, {
      error:
        rl.scope === "day"
          ? "Voice is unavailable for the rest of today."
          : "Voice is busy. Please wait a moment.",
    });
  }

  let body: any;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid request body" });
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return sendJson(res, 400, { error: "No text to speak" });

  const voice = ALLOWED_VOICES.includes(body?.voice) ? body.voice : DEFAULT_VOICE;
  const input = text.slice(0, MAX_TTS_CHARS);
  // Newer models take a free-text tone instruction; the classic tts-1 / tts-1-hd
  // take a numeric speed. Send only what the configured model understands.
  const steerable =
    TTS_MODEL.startsWith("gpt-4o-mini-tts") || TTS_MODEL.startsWith("gpt-4o-audio");

  const payload: Record<string, unknown> = {
    model: TTS_MODEL,
    voice,
    input,
    response_format: "mp3",
  };
  // Set pace server-side: tts-1 / tts-1-hd take a deterministic, pitch-preserving
  // `speed`; the steerable models take a tone instruction instead (no precise
  // speed). Doing it here, not via client playbackRate, keeps the voice + pace
  // consistent - especially on Safari.
  if (steerable) payload.instructions = TONE;
  else payload.speed = TTS_SPEED;

  try {
    const upstream = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TTS_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error("[tts] upstream error:", upstream.status, detail.slice(0, 300));
      return sendJson(res, 502, { error: "Voice is unavailable right now." });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    // Stream the audio straight through to the client.
    const reader = (upstream.body as any).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err: any) {
    console.error("[tts] request failed:", err?.message);
    if (!res.headersSent) {
      sendJson(res, 502, { error: "Voice is unavailable right now." });
    } else {
      try {
        res.end();
      } catch {
        /* connection already closed */
      }
    }
  }
}
