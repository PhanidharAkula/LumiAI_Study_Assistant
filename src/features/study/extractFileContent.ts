/**
 * Shared study-tools file extraction (Quiz + Flashcards).
 *
 * Pulls the text of a class file so the AI can chart questions or compose
 * cards from it: signed/public URL lookup, PDF text via pdf.js (first 30
 * pages), plain-text reads - all capped at 50k characters. Extracted verbatim
 * from QuizComponent/FlashcardsComponent; behavior must stay identical.
 */
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import { getFilePublicUrl } from "@shared/utils/storageUtils";

// Configure PDF.js worker (module-level, exactly as the components did).
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/** A class file row as both study tools receive it. */
export interface StudyFile {
  id: string;
  name: string;
  path?: string;
  file_path?: string;
  [key: string]: any;
}

export async function extractFileContent(
  file: StudyFile
): Promise<string | null> {
  try {
    const { url, error } = await getFilePublicUrl(
      "files",
      (file.path || file.file_path) as string
    );
    if (!url || error) {
      console.error(`Could not get URL for ${file.name}:`, error);
      return null;
    }

    // Handle PDF files
    if (file.name.toLowerCase().endsWith(".pdf")) {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`PDF fetch failed: HTTP ${resp.status}`);
        return null;
      }

      const arrayBuffer = await resp.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      let fullText = "";
      const maxPages = Math.min(pdf.numPages, 30);

      for (let p = 1; p <= maxPages; p++) {
        try {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const strings = content.items.map((it: any) => it.str).join(" ");
          fullText += strings + "\n\n";

          if (fullText.length > 50000) break;
        } catch (pageErr) {
          console.warn(`Error extracting page ${p}:`, pageErr);
          break;
        }
      }

      const extractedText = fullText.slice(0, 50000).trim();
      return extractedText.length > 0 ? extractedText : null;
    }

    // Handle text files
    if (file.name.toLowerCase().endsWith(".txt")) {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.error(`Text file fetch failed: HTTP ${resp.status}`);
        return null;
      }
      const text = await resp.text();
      return text.slice(0, 50000).trim();
    }

    console.warn(`Unsupported file type: ${file.name}`);
    return null;
  } catch (error) {
    console.error(`Error extracting file content:`, error);
    return null;
  }
}
