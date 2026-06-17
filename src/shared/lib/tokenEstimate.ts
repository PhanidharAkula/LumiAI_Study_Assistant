/**
 * Rough client-side token estimate for the per-chat context bar and the
 * auto-compaction trigger. English text runs ~4 characters per token under
 * typical BPE tokenizers, so chars/4 is a good-enough gauge here; the server
 * meters exact token usage for the daily budget. Deliberately cheap (no
 * tokenizer dependency) since it runs on every render over the whole thread.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
