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

function friendlyError(status: number, fallback: string): string {
  if (status === 401) return "AI authentication failed — check ANTHROPIC_API_KEY.";
  if (status === 429) return "Rate limit reached. Please try again in a moment.";
  if (status === 529) return "The AI service is temporarily overloaded. Please retry.";
  return fallback;
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, {
      error:
        "AI is not configured yet. Set ANTHROPIC_API_KEY in your environment (.env locally, Vercel project settings in production).",
    });
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
        res.write(
          `data: ${JSON.stringify({
            error: friendlyError(err?.status ?? 500, err?.message || "Stream error"),
          })}\n\n`
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
    const message = friendlyError(status, err?.message || "AI request failed");
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
