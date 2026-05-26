/**
 * AI service — talks to the Claude (Anthropic) backend at /api/chat.
 *
 * The Anthropic API key is NEVER used in the browser; every call goes through
 * the serverless function. This module just builds the normalized payload
 * (system prompt + messages) and parses the streamed / JSON response.
 */

const API_URL = "/api/chat";

type Role = "user" | "assistant";
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string };
export interface ChatMessage {
  role: Role;
  content: string | ContentPart[];
}
export interface UploadedFile {
  name?: string;
  type?: string;
  base64?: string;
  text?: string | null;
}
export interface AIResult {
  text: string | null;
  error: string | null;
  errorType?: "quota" | "api" | "aborted";
}

/* ----------------------------- System prompts ---------------------------- */

const FORMATTING_GUIDELINES = `
## Response Style Guidelines

**Tone & Personality**
- Be genuinely helpful, intelligent, and conversational — like a knowledgeable friend.
- Use natural language and contractions. Be personable but not robotic.

**Structure**
- Open with a direct, contextual response (no generic "How can I help?").
- For complex topics, give well-organized explanations with clear headings (##, ###).
- Include practical examples, analogies, and real-world applications.
- Use code blocks with syntax highlighting when relevant.
- End with a thought-provoking question or actionable next step.

**Content Quality**
- Go beyond surface-level. Explain not just *what* but *why* and *how*.
- When listing items, explain why they matter. Add pro tips and caveats where useful.

**Formatting**
- Use bullet points and numbered lists effectively; keep paragraphs short and scannable.
- Use emphasis (bold/italics) and the occasional emoji (✅, 🎯, 💡, ⚠️, 🚀) sparingly.

**Avoid**
- Prefatory filler ("Sure, here's...", "Certainly!"), bland sign-offs, and templated answers.`;

const LUMI_SYSTEM_PROMPT = `You are Lumi — an exceptionally intelligent, engaging, and helpful AI study assistant. You're like a brilliant tutor who genuinely cares about helping students understand complex topics.

**Context awareness**
- When the user's message includes study materials (marked "[📚 Study Materials Context]") or uploaded documents (marked "[📎 Uploaded Document]"), analyze that content carefully and reference it directly in your answer — quote and connect specific points.
- When no materials are provided, give comprehensive, insightful answers from your own knowledge.
- Adapt your depth and style to the complexity of the question.

${FORMATTING_GUIDELINES}`;

const VOICE_GUIDELINES = `
## Voice Conversation Guidelines
- Keep responses natural, concise, and conversational — like a friendly human, not a robot.
- Most replies should be 1-3 sentences unless the topic genuinely needs more.
- Vary your openings; don't repeat the same greeting. Get to the point warmly.
- Plain spoken language only — no markdown, headings, bullet points, or emoji (this will be read aloud).`;

function voiceSystemPrompt(context: string): string {
  const base = `You are Lumi, a warm and knowledgeable AI study assistant having a spoken conversation.`;
  const ctx = context && context.trim()
    ? `\n\nUse the following study materials when relevant:\n=== BEGIN MATERIALS ===\n${context}\n=== END MATERIALS ===`
    : "";
  return `${base}${ctx}\n${VOICE_GUIDELINES}`;
}

function textSystemPrompt(context: string): string {
  if (context && context.trim()) {
    return `You are Lumi — an exceptionally intelligent and engaging AI study assistant. Use the study materials below when relevant.

=== BEGIN STUDY MATERIALS ===
${context}
=== END STUDY MATERIALS ===

${FORMATTING_GUIDELINES}`;
  }
  return `You are Lumi — an exceptionally intelligent and engaging AI study assistant. Be conversational, insightful, and provide thorough explanations that go beyond basic facts.\n${FORMATTING_GUIDELINES}`;
}

/* ------------------------------- Helpers --------------------------------- */

/** Build a valid Anthropic-style message list (first message must be user). */
function buildMessages(
  history: ChatMessage[],
  userContent: string | ContentPart[]
): ChatMessage[] {
  const msgs: ChatMessage[] = (Array.isArray(history) ? history : [])
    .filter((m) => m && m.role && m.content != null)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const last = msgs[msgs.length - 1];
  const dupe =
    last &&
    last.role === "user" &&
    typeof last.content === "string" &&
    typeof userContent === "string" &&
    last.content === userContent;
  if (!dupe) msgs.push({ role: "user", content: userContent });

  // Anthropic requires the conversation to start with a user turn.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length) msgs.push({ role: "user", content: userContent });
  return msgs;
}

async function postJson(
  body: unknown,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

/* ------------------------------- Public API ------------------------------ */

/**
 * Streaming chat completion. Calls `onToken` for each text delta.
 * Used by chat, quiz generation, and flashcard generation.
 */
export const fetchStreamingResponse = async (
  userMessage: string,
  context = "",
  onToken: (token: string) => void,
  signal?: AbortSignal,
  history: ChatMessage[] = [],
  files: UploadedFile[] = []
): Promise<AIResult> => {
  let complete = "";
  try {
    const parts: ContentPart[] = [];
    if (context && context.trim()) {
      parts.push({
        type: "text",
        text: `[📚 Study Materials Context — files from your classes]\n\n${context}\n\n[End of Study Materials Context]\n`,
      });
    }
    if (userMessage && userMessage.trim()) {
      parts.push({ type: "text", text: userMessage });
    }
    for (const file of files || []) {
      if (file.base64 && file.type && file.type.startsWith("image/")) {
        parts.push({ type: "image", dataUrl: file.base64 });
      }
      if (file.text) {
        parts.push({
          type: "text",
          text: `\n\n[📎 Uploaded Document: ${file.name}]\n${file.text}\n[End of uploaded document]\n`,
        });
      }
    }

    let userContent: string | ContentPart[] = parts;
    if (parts.length === 0) {
      userContent = userMessage;
    } else if (parts.length === 1 && (!files || files.length === 0)) {
      const only = parts[0];
      if (only.type === "text") userContent = only.text;
    }

    const messages = buildMessages(history, userContent);

    const response = await postJson(
      { system: LUMI_SYSTEM_PROMPT, messages, stream: true, maxTokens: 16000 },
      signal
    );

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({} as any));
      const message = data.error || "Failed to get a response from the AI.";
      return {
        text: null,
        error: message,
        errorType: response.status === 429 ? "quota" : "api",
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep the trailing partial line
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) {
            complete += parsed.text;
            onToken(parsed.text);
          } else if (parsed.error) {
            return { text: complete || null, error: parsed.error, errorType: "api" };
          }
        } catch {
          /* ignore malformed SSE chunk */
        }
      }
    }

    return { text: complete, error: null };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return { text: complete || null, error: "aborted", errorType: "aborted" };
    }
    console.error("Error calling AI:", error);
    return {
      text: null,
      error: "Error connecting to the AI. Please try again later.",
      errorType: "api",
    };
  }
};

/**
 * Non-streaming completion. `isVoiceMode` switches to concise, speakable replies.
 * Used by the voice (Talk) experience.
 */
export const fetchAIResponse = async (
  userMessage: string,
  context = "",
  history: ChatMessage[] = [],
  isVoiceMode = false
): Promise<AIResult> => {
  try {
    const system = isVoiceMode
      ? voiceSystemPrompt(context)
      : textSystemPrompt(context);
    const messages = buildMessages(history, userMessage);

    const response = await postJson({
      system,
      messages,
      stream: false,
      maxTokens: isVoiceMode ? 1024 : 4096,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({} as any));
      const message = data.error || "Failed to get a response from the AI.";
      return {
        text: null,
        error: message,
        errorType: response.status === 429 ? "quota" : "api",
      };
    }

    const data = await response.json();
    return { text: (data.text || "").trim(), error: null };
  } catch (error: any) {
    console.error("Error calling AI:", error);
    return {
      text: null,
      error: "Error connecting to the AI. Please try again later.",
      errorType: "api",
    };
  }
};

/** Generate a short conversation title from the first Q/A exchange. */
export const generateConversationTitle = async (
  userMessage: string,
  aiResponse: string
): Promise<string> => {
  try {
    const system = `You generate concise conversation titles. Given a question and the AI's reply, produce a short, meaningful title that captures the main topic.
Rules: under 7 words; natural capitalization (e.g. "Understanding React Hooks"); no surrounding quotes or trailing punctuation. Output ONLY the title.`;

    // Put both turns in a single user message — Opus 4.7 rejects assistant prefills.
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: `Question:\n${userMessage}\n\nAI answer:\n${aiResponse}\n\nWrite the title now.`,
      },
    ];

    const response = await postJson({ system, messages, stream: false, maxTokens: 32 });
    if (!response.ok) return "New Conversation";

    const data = await response.json();
    const title = (data.text || "").trim().replace(/^["']|["']$/g, "");
    return title || "New Conversation";
  } catch (error) {
    console.error("Error generating conversation title:", error);
    return "New Conversation";
  }
};
