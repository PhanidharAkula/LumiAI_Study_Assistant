/**
 * TTS service - fetches natural spoken audio from /api/tts.
 *
 * The provider key never touches the browser; this just sends text + a voice id
 * with the user's Supabase token and gets back an MP3 blob to play.
 */
import { supabase } from "@shared/lib/supabaseClient";

const TTS_URL = "/api/tts";

/** Fetch spoken audio for one line of text. Returns an MP3 Blob, or throws. */
export async function fetchSpeech(
  text: string,
  voice: string,
  signal?: AbortSignal
): Promise<Blob> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const resp = await fetch(TTS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ text, voice }),
    signal,
  });
  if (!resp.ok) throw new Error(`TTS failed: ${resp.status}`);
  return resp.blob();
}
