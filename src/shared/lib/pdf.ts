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

export interface RenderedPdfImage {
  type: "image/jpeg";
  base64: string;
}

// pdfjs operator codes for "this page paints a raster image" - used to render
// ONLY the pages of a text PDF that actually contain a figure/photo.
const IMAGE_OPS = new Set<number>(
  [
    (pdfjsLib as any).OPS?.paintImageXObject,
    (pdfjsLib as any).OPS?.paintInlineImageXObject,
    (pdfjsLib as any).OPS?.paintImageMaskXObject,
  ].filter((n) => typeof n === "number")
);

/**
 * Rasterize PDF pages to JPEG data URLs for vision. Used for scanned/image-only
 * PDFs (the only way to "read" them) and to capture figures embedded in an
 * otherwise-text PDF. Pages are downscaled so the long edge is <= maxDim (so the
 * payload + token cost stay sane), and the page count is capped.
 */
export async function renderPdfToImages(
  data: ArrayBuffer | Uint8Array,
  opts: { maxPages?: number; maxDim?: number; onlyImagePages?: boolean } = {}
): Promise<{ images: RenderedPdfImage[]; truncated: boolean }> {
  const { maxPages = 12, maxDim = 1568, onlyImagePages = false } = opts;
  const images: RenderedPdfImage[] = [];
  let truncated = false;
  try {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    for (let p = 1; p <= pdf.numPages; p++) {
      if (images.length >= maxPages) {
        truncated = true;
        break;
      }
      try {
        const page = await pdf.getPage(p);
        if (onlyImagePages) {
          const ops = await page.getOperatorList();
          if (!ops.fnArray.some((fn: number) => IMAGE_OPS.has(fn))) continue;
        }
        const base = page.getViewport({ scale: 1 });
        const longEdge = Math.max(base.width, base.height) || 1;
        const scale = Math.min(2, maxDim / longEdge);
        const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        // White backing: JPEG has no alpha, so transparent areas would go black.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport } as any).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        if (dataUrl.startsWith("data:image/jpeg"))
          images.push({ type: "image/jpeg", base64: dataUrl });
      } catch {
        /* skip a page that fails to render; keep the rest */
      }
    }
  } catch (error) {
    console.error("Error rendering PDF to images:", error);
  }
  return { images, truncated };
}
