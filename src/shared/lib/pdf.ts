// Shared PDF text extraction. One build with a worker bundled locally (via Vite
// `?url`, so there is no runtime CDN dependency that a blocked network could
// break), used by both the chat input (uploads) and the class-file context
// builder. Extracts every page with no page or character limit.
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Extract all text from a PDF - every page, no limit. A page that fails to
 * parse is skipped so the rest still comes through; returns "" if the document
 * itself can't be opened.
 */
export async function extractPdfText(
  data: ArrayBuffer | Uint8Array
): Promise<string> {
  try {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let fullText = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      try {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((it: any) => (typeof it.str === "string" ? it.str : ""))
          .join(" ");
        fullText += pageText + "\n\n";
      } catch {
        /* skip a page that fails to parse; keep the rest */
      }
    }
    return fullText.trim();
  } catch (error) {
    console.error("Error extracting PDF text:", error);
    return "";
  }
}
