/**
 * Shared study-tool material resolver (Quiz + Flashcards).
 *
 * Turns the selected class files into what the generator can consume - exactly
 * like Chat with AI does - via the unified resolveFileForAI: extracted TEXT
 * (PDF, DOCX, PPTX, code/data, sniffed unknowns) for the prompt, plus base64
 * vision IMAGES (photos, scanned PDFs, figure pages, HEIC) sent alongside. So a
 * student can build cards/quizzes from essentially anything they uploaded, not
 * just PDF/TXT. Replaces the old PDF/TXT-only extractFileContent.
 */
import { resolveFileForAI } from "@shared/lib/fileExtract";
import { getFilePublicUrl } from "@shared/utils/storageUtils";
import type { UploadedFile } from "@shared/services/aiService";

/** A class file row as both study tools receive it. */
export interface StudyFile {
  id: string;
  name: string;
  path?: string;
  file_path?: string;
  [key: string]: any;
}

export interface StudyMaterials {
  /** Named text blocks (and notes) for the generation prompt; "" if none. */
  context: string;
  /** Per-file vision carriers for fetchStreamingResponse's `files` param. */
  imageFiles: UploadedFile[];
  /** Files that yielded usable text or images. */
  usableCount: number;
  /** Files attempted. */
  attempted: number;
}

// Overall text budget across all selected files (each file is already capped
// inside resolveFileForAI). Keeps one big selection from swamping the request.
const MAX_CONTEXT = 200000;

/**
 * Resolve the given class files into prompt text + vision images. Never throws:
 * a file that can't be fetched or read is skipped and simply doesn't count
 * toward usableCount.
 */
export async function resolveStudyFiles(
  files: StudyFile[]
): Promise<StudyMaterials> {
  const textParts: string[] = [];
  const imageFiles: UploadedFile[] = [];
  let usableCount = 0;

  for (const file of files) {
    try {
      const { url, error } = await getFilePublicUrl(
        "files",
        (file.path || file.file_path) as string
      );
      if (!url || error) {
        console.warn(`resolveStudyFiles: no URL for ${file.name}`, error);
        continue;
      }
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`resolveStudyFiles: fetch ${file.name} -> ${resp.status}`);
        continue;
      }
      const blob = await resp.blob();
      const resolved = await resolveFileForAI(blob, file.name || "file");

      const hasText = resolved.text.trim().length > 0;
      const hasImages = resolved.images.length > 0;
      if (!hasText && !hasImages) continue; // nothing the model can read

      usableCount++;
      const header = `=== ${file.name} ===`;
      if (hasText) {
        textParts.push(
          `${header}\n${resolved.text}${
            resolved.note ? `\n${resolved.note}` : ""
          }`
        );
      } else if (resolved.note) {
        // Image-only file (photo / scanned PDF): give the model the filename and
        // a pointer to the attached images so it can correlate them.
        textParts.push(`${header}\n${resolved.note}`);
      }
      if (hasImages) {
        imageFiles.push({ name: file.name, images: resolved.images });
      }
    } catch (e) {
      console.warn(`resolveStudyFiles: failed for ${file?.name}`, e);
    }
  }

  let context = textParts.join("\n\n");
  if (context.length > MAX_CONTEXT) context = context.slice(0, MAX_CONTEXT);
  return { context, imageFiles, usableCount, attempted: files.length };
}
