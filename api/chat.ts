/**
 * Vercel serverless function - AI chat proxy.
 *
 * Keeps the API key server-side. Accepts a normalized payload and
 * translates it to the provider's Messages API, supporting streaming (SSE) and
 * non-streaming responses, plus prompt caching on the system prompt.
 *
 * Written to be runtime-agnostic: works on Vercel (which populates req.body)
 * and through the Vite dev middleware (which does not) - see vite.config.js.
 */
import AI from "@anthropic-ai/sdk";
import { getAuthedUser } from "./_auth.js";
import {
  getDailyTokens,
  addDailyTokens,
  burstOk,
  getDailyTokenLimit,
} from "./_ratelimit.js";

// The chat model id, supplied by the LUMI_MODEL env var.
const MODEL = process.env.LUMI_MODEL || "";

// Voice (Talk) replies use a faster model by default for low latency - they're
// short and spoken, so they don't need the heavier chat model. Override with
// LUMI_VOICE_MODEL (e.g. set it to LUMI_MODEL for matching quality).
const VOICE_MODEL = process.env.LUMI_VOICE_MODEL || "claude-haiku-4-5";

// Thinking effort for chat. Sonnet 4.6 defaults to "high", which over-reasons
// (and over-delays) lighter turns; "medium" keeps answer quality while trimming
// latency on heavier questions. Tune to "low" for snappier, "high" for deeper.
const CHAT_EFFORT = "medium";

// Anti-flood burst guard (requests/min/user). The real cap is the shared daily
// TOKEN budget (see _ratelimit + app_settings.daily_token_limit). 0 disables it.
const CHAT_BURST = Number(process.env.LUMI_CHAT_BURST ?? 30);

type Role = "user" | "assistant";
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string };
interface InMessage {
  role: Role;
  content: string | ContentPart[];
}
interface ChatBody {
  system?: string;
  messages: InMessage[];
  stream?: boolean;
  maxTokens?: number;
  /** When true, expose the provider's server-side web_search tool to the model. */
  webSearch?: boolean;
  /** When true, enable adaptive extended thinking (hidden reasoning before the
   *  answer). Keeps any "should I search?" deliberation out of the streamed text. */
  thinking?: boolean;
  /** When true, this is a spoken (Talk) reply: use the faster voice model. */
  voice?: boolean;
}

/** Read + parse the JSON body whether or not the runtime pre-parsed it. */
// Bound the body so a client can't exhaust function memory with an unbounded
// upload (cost / DoS). 16 MB comfortably covers a few base64 images.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

async function readBody(req: any): Promise<ChatBody> {
  if (req.body && typeof req.body === "object") return req.body as ChatBody;
  if (typeof req.body === "string" && req.body.length) {
    if (req.body.length > MAX_BODY_BYTES) {
      throw new Error("Request body too large");
    }
    return JSON.parse(req.body);
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
  return raw ? JSON.parse(raw) : ({ messages: [] } as ChatBody);
}

function sendJson(res: any, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/** Convert our normalized content into the API's content blocks. */
function toApiContent(content: string | ContentPart[]): any {
  if (typeof content === "string") return content;
  const blocks = content
    .map((part) => {
      if (part.type === "text") {
        return part.text && part.text.trim()
          ? { type: "text", text: part.text }
          : null;
      }
      if (part.type === "image" && part.dataUrl) {
        const match = /^data:([^;]+);base64,(.*)$/s.exec(part.dataUrl);
        if (!match) return null;
        // The API only accepts these image media types; drop anything else so a
        // bad upload is skipped cleanly instead of 400-ing the whole request.
        const ALLOWED_IMAGE = ["image/png", "image/jpeg", "image/gif", "image/webp"];
        if (!ALLOWED_IMAGE.includes(match[1]!)) return null;
        return {
          type: "image",
          source: { type: "base64", media_type: match[1]!, data: match[2]! },
        };
      }
      return null;
    })
    .filter(Boolean);
  // The API requires non-empty content; fall back to a single space.
  return blocks.length ? blocks : " ";
}

// User-facing copy must never reveal the AI provider, API keys, billing, or raw
// error text (e.g. a 400 "credit balance too low" or a 401 about the API key).
// Everything maps to friendly, on-brand messages; the real error is logged
// server-side only (never sent to the client).
/** Best-effort pull of the provider's raw error text. Used ONLY to classify the
 *  failure server-side; it is never sent to the client. */
function rawErrorText(err: any): string {
  return String(
    err?.error?.error?.message ?? err?.error?.message ?? err?.message ?? ""
  );
}

function friendlyError(status?: number, raw?: string): string {
  // A billing / credit-exhaustion failure arrives as a 400 whose text mentions
  // the account balance. It won't clear on a quick retry, so soften to "try
  // again later" - still without ever naming the provider, credits, or billing.
  if (raw && /credit|billing|balance|payment|insufficient/i.test(raw)) {
    return "Lumi is unavailable right now. Please try again later.";
  }
  if (status === 429 || status === 503 || status === 529) {
    return "Lumi is a little busy right now. Please try again in a moment.";
  }
  return "Lumi couldn't respond just now. Please try again in a moment.";
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.LUMI_API_KEY;
  if (!apiKey || !MODEL) {
    // Config problem - log it for ops, but never expose it to the user.
    console.error("[chat] API key or model is not configured");
    return sendJson(res, 503, {
      error: "Lumi is temporarily unavailable. Please try again soon.",
    });
  }

  // Require a signed-in user so the endpoint can't be called anonymously to
  // burn AI credits. (The API key is never exposed to the client either way.)
  const auth = await getAuthedUser(req);
  if (!auth.ok) {
    return sendJson(res, auth.status, {
      error:
        auth.status === 401
          ? "Please sign in to use Lumi."
          : "Lumi is temporarily unavailable. Please try again soon.",
    });
  }

  // Shared daily TOKEN budget (across chat/quiz/flashcards/voice) + a light
  // anti-flood burst. No-op until a KV store is connected; fails open.
  const tokenLimit = await getDailyTokenLimit(auth.token);
  if ((await getDailyTokens(auth.userId)) >= tokenLimit) {
    return sendJson(res, 429, {
      code: "budget_exhausted",
      error: "You've used today's Lumi limit. It resets tomorrow.",
    });
  }
  if (!(await burstOk(auth.userId, CHAT_BURST))) {
    return sendJson(res, 429, {
      error:
        "You're going a little fast for Lumi. Please wait a moment and try again.",
    });
  }

  let body: ChatBody;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid request body" });
  }

  const {
    system,
    messages,
    stream = true,
    maxTokens,
    webSearch,
    thinking,
    voice,
  } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, {
      error: "Invalid request: messages array required",
    });
  }

  const client = new AI({ apiKey });

  const apiMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: toApiContent(m.content),
  }));

  // Cache the (stable) system prompt to cut latency/cost on repeat calls.
  const systemParam =
    system && system.trim()
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : undefined;

  // Cache the conversation prefix. The real per-turn cost is re-sending prior
  // turns + any attached study materials, not the (small, sub-minimum) system
  // prompt - so a breakpoint on the latest message caches [system ... this turn]
  // and the next turn reads it instead of reprocessing it. Below the cache
  // minimum it's ignored automatically, so short chats pay nothing.
  const tail: any = apiMessages[apiMessages.length - 1];
  if (tail) {
    const blocks: any[] = Array.isArray(tail.content)
      ? tail.content
      : [{ type: "text", text: String(tail.content || " ") }];
    if (blocks.length) {
      blocks[blocks.length - 1] = {
        ...blocks[blocks.length - 1],
        cache_control: { type: "ephemeral" },
      };
      tail.content = blocks;
    }
  }

  // max_tokens is a hard cap, not a target - generous but bounded.
  const max_tokens = Math.min(
    Math.max(maxTokens ?? (stream ? 16000 : 4096), 256),
    64000
  );

  const request: Record<string, unknown> = {
    model: voice ? VOICE_MODEL : MODEL,
    max_tokens,
    messages: apiMessages,
  };

  // The model runs the web search server-side and weaves results into its
  // streamed answer; max_uses caps a single question from spawning an unbounded
  // crawl. The _20260209 version adds dynamic filtering (the model filters
  // results before they reach the context window, improving accuracy + token
  // efficiency) on Sonnet 4.6 and the Opus family - i.e. every thinking-capable
  // model LUMI_MODEL would be set to.
  if (webSearch) {
    request.tools = [
      { type: "web_search_20260209", name: "web_search", max_uses: 5 },
    ];
  }
  // Adaptive extended thinking: the model reasons (and decides whether to
  // search) in hidden thinking blocks, then emits only the final answer as
  // text, so no "let me search" preamble ever reaches the client. Supported on
  // Sonnet 4.6 and the Opus 4.x family.
  if (thinking) {
    request.thinking = { type: "adaptive" };
    request.output_config = { effort: CHAT_EFFORT };
  }
  if (systemParam) request.system = systemParam;

  try {
    if (stream) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const streaming = client.messages.stream(request as any);
      let textStarted = false;
      streaming.on("text", (delta: string) => {
        textStarted = true;
        res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
      });

      // Watch the raw event stream for the first web-search tool call. Whatever
      // text the model streamed BEFORE it searched was a preamble ("let me look
      // that up"), not the answer, so signal the client to discard everything so
      // far. This keys off the actual tool-use event, not the wording, so it is
      // robust to any phrasing or language (no preamble pattern-matching).
      let clearedPreamble = false;
      streaming.on("streamEvent", (event: any) => {
        // Only treat pre-search text as a discardable preamble if NO answer text
        // has streamed yet; a search that begins mid-answer must not wipe it.
        if (
          event?.type !== "content_block_start" ||
          clearedPreamble ||
          textStarted
        )
          return;
        const blockType = event.content_block?.type;
        if (
          blockType === "server_tool_use" ||
          blockType === "web_search_tool_result"
        ) {
          clearedPreamble = true;
          res.write(`data: ${JSON.stringify({ clearPreamble: true })}\n\n`);
        }
      });

      try {
        const final = await streaming.finalMessage();
        // A safety refusal (on capable models) returns HTTP 200 with
        // stop_reason "refusal" and little or no text. Surface a friendly error
        // so the client never saves a blank/partial answer as a real reply.
        if ((final as any)?.stop_reason === "refusal") {
          res.write(
            `data: ${JSON.stringify({
              error:
                "Lumi can't help with that particular request. Try rephrasing or asking something else.",
            })}\n\n`
          );
        }
        // Meter the tokens this turn actually consumed against the daily budget.
        const u = (final as any)?.usage;
        await addDailyTokens(
          auth.userId,
          (u?.input_tokens ?? 0) +
          (u?.output_tokens ?? 0) +
          (u?.cache_creation_input_tokens ?? 0) +
          (u?.cache_read_input_tokens ?? 0)
        );
      } catch (err: any) {
        console.error("[chat] stream error:", err?.status, err?.message);
        res.write(
          `data: ${JSON.stringify({ error: friendlyError(err?.status, rawErrorText(err)) })}\n\n`
        );
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      const msg = await client.messages.create(request as any);
      // Mirror the streaming refusal handling: a safety refusal returns 200 with
      // stop_reason "refusal" and little/no text - surface a friendly error so a
      // caller (title generation, voice) never saves a blank reply as a real one.
      if ((msg as any)?.stop_reason === "refusal") {
        return sendJson(res, 200, {
          error:
            "Lumi can't help with that particular request. Try rephrasing or asking something else.",
        });
      }
      const text = (msg.content as any[])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const u = (msg as any)?.usage;
      await addDailyTokens(
        auth.userId,
        (u?.input_tokens ?? 0) +
          (u?.output_tokens ?? 0) +
          (u?.cache_creation_input_tokens ?? 0) +
          (u?.cache_read_input_tokens ?? 0)
      );
      sendJson(res, 200, { text });
    }
  } catch (err: any) {
    const status =
      typeof err?.status === "number" && Number.isInteger(err.status)
        ? err.status
        : 500;
    console.error("[chat] request error:", status, err?.message);
    const message = friendlyError(status, rawErrorText(err));
    if (!res.headersSent) {
      sendJson(res, status, { error: message });
    } else {
      try {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.end();
      } catch {
        /* connection already closed */
      }
    }
  }
}
