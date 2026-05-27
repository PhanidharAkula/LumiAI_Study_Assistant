/**
 * Vercel serverless function — Claude (Anthropic) chat proxy.
 *
 * Keeps ANTHROPIC_API_KEY server-side. Accepts a normalized payload and
 * translates it to the Anthropic Messages API, supporting streaming (SSE) and
 * non-streaming responses, plus prompt caching on the system prompt.
 *
 * Written to be runtime-agnostic: works on Vercel (which populates req.body)
 * and through the Vite dev middleware (which does not) — see vite.config.js.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

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
}

/** Read + parse the JSON body whether or not the runtime pre-parsed it. */
async function readBody(req: any): Promise<ChatBody> {
  if (req.body && typeof req.body === "object") return req.body as ChatBody;
  if (typeof req.body === "string" && req.body.length) {
    return JSON.parse(req.body);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : ({ messages: [] } as ChatBody);
}

function sendJson(res: any, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/** Convert our normalized content into Anthropic content blocks. */
function toAnthropicContent(content: string | ContentPart[]): any {
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
        return {
          type: "image",
          source: { type: "base64", media_type: match[1], data: match[2] },
        };
      }
      return null;
    })
    .filter(Boolean);
  // Anthropic requires non-empty content; fall back to a single space.
  return blocks.length ? blocks : " ";
}

// User-facing copy must never reveal the AI provider, API keys, billing, or raw
// error text (e.g. a 400 "credit balance too low" or a 401 about the API key).
// Everything maps to friendly, on-brand messages; the real error is logged
// server-side only (never sent to the client).
function friendlyError(status?: number): string {
  if (status === 429 || status === 503 || status === 529) {
    return "Lumi is a little busy right now. Please try again in a moment.";
  }
  return "Lumi couldn't respond just now. Please try again in a moment.";
}

/**
 * Verify the caller's Supabase session. The browser sends its access token as a
 * Bearer header; we validate it against Supabase's auth endpoint using the
 * public project URL + anon key (no secrets needed) so this endpoint can't be
 * used anonymously to burn AI credits. Returns the user id, or null if the
 * token is missing/invalid.
 */
async function getAuthedUserId(req: any): Promise<string | null> {
  const header: string =
    req.headers?.authorization || req.headers?.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("[chat] Supabase URL/anon key not set — cannot verify session");
    return null;
  }

  try {
    const resp = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });
    if (!resp.ok) return null;
    const user = (await resp.json()) as { id?: string };
    return user?.id ?? null;
  } catch (err: any) {
    console.error("[chat] session verification failed:", err?.message);
    return null;
  }
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Config problem — log it for ops, but never expose it to the user.
    console.error("[chat] ANTHROPIC_API_KEY is not set");
    return sendJson(res, 503, {
      error: "Lumi is temporarily unavailable. Please try again soon.",
    });
  }

  // Require a signed-in user so the endpoint can't be called anonymously to
  // burn AI credits. (The API key is never exposed to the client either way.)
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return sendJson(res, 401, { error: "Please sign in to use Lumi." });
  }

  let body: ChatBody;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid request body" });
  }

  const { system, messages, stream = true, maxTokens } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: "Invalid request: messages array required" });
  }

  const client = new Anthropic({ apiKey });

  const anthropicMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: toAnthropicContent(m.content),
  }));

  // Cache the (stable) system prompt to cut latency/cost on repeat calls.
  const systemParam = system && system.trim()
    ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
    : undefined;

  // max_tokens is a hard cap, not a target — generous but bounded.
  const max_tokens = Math.min(
    Math.max(maxTokens ?? (stream ? 16000 : 4096), 256),
    64000
  );

  const request: Record<string, unknown> = {
    model: MODEL,
    max_tokens,
    messages: anthropicMessages,
  };
  if (systemParam) request.system = systemParam;

  try {
    if (stream) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const streaming = client.messages.stream(request as any);
      streaming.on("text", (delta: string) => {
        res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
      });

      try {
        await streaming.finalMessage();
      } catch (err: any) {
        console.error("[chat] stream error:", err?.status, err?.message);
        res.write(
          `data: ${JSON.stringify({ error: friendlyError(err?.status) })}\n\n`
        );
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      const msg = await client.messages.create(request as any);
      const text = (msg.content as any[])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      sendJson(res, 200, { text });
    }
  } catch (err: any) {
    const status =
      typeof err?.status === "number" && Number.isInteger(err.status)
        ? err.status
        : 500;
    console.error("[chat] request error:", status, err?.message);
    const message = friendlyError(status);
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
