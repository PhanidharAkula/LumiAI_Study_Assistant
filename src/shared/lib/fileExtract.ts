/**
 * Unified study-material resolver: turn any uploaded/tagged file into what the
 * AI can actually consume - extracted TEXT and/or base64 IMAGES (vision) - so a
 * student can attach essentially anything (notes, slides, code, board photos,
 * scanned PDFs, iPhone HEICs) and ask about it.
 *
 * Used by BOTH the chat input (uploads) and the class-file context builder
 * (tags), so the two paths behave identically. Heavy parsers (jszip for
 * docx/pptx, heic2any for HEIC) are dynamically imported, so they only load when
 * a file of that type is actually processed - the initial bundle stays small.
 */
import { extractPdfText, renderPdfToImages } from "./pdf";

export interface AIImagePart {
  type: string; // image MIME (png/jpeg/gif/webp)
  base64: string; // full data URL
}

export interface ResolvedFile {
  /** Extracted text ("" if none). */
  text: string;
  /** Vision inputs (data URLs), already downscaled + typed for the API. */
  images: AIImagePart[];
  /** A short human note for the context block (e.g. "scanned PDF attached"). */
  note: string;
}

// Generous per-file text cap so one huge file can't swamp the turn (the overall
// per-turn context is capped again at the call site).
const MAX_FILE_TEXT = 100000;
// Long-edge cap for any image sent to the model. Past ~1568px the API downscales
// anyway, so sending bigger just wastes payload + tokens.
const IMG_MAX_DIM = 1568;

// Code / text / data extensions that are safe to read as plain text. The model
// reads source as well as prose, so this list is deliberately broad.
const TEXT_EXT = new Set([
  "txt", "text", "md", "markdown", "mdx", "rst", "log", "csv", "tsv", "json",
  "json5", "jsonl", "ndjson", "xml", "yaml", "yml", "toml", "ini", "cfg",
  "conf", "config", "env", "properties", "html", "htm", "xhtml", "css", "scss",
  "sass", "less", "svg", "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "pyw",
  "pyi", "rb", "php", "java", "kt", "kts", "scala", "groovy", "c", "h", "cpp",
  "cc", "cxx", "hpp", "hh", "cs", "go", "rs", "swift", "m", "mm", "dart", "lua",
  "pl", "pm", "r", "jl", "ex", "exs", "erl", "hrl", "hs", "clj", "cljs", "elm",
  "sql", "graphql", "gql", "proto", "sol", "vue", "svelte", "astro", "sh",
  "bash", "zsh", "fish", "ps1", "bat", "cmd", "make", "mk", "cmake", "gradle",
  "dockerfile", "gitignore", "gitattributes", "editorconfig", "tex", "bib",
  "asm", "s", "vb", "f", "f90", "pas", "d", "nim", "zig", "v",
]);

// Image extensions the browser/canvas can decode and re-encode for the API.
const RASTER_IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|avif)$/i;

// Ensure a data URL declares the given MIME (the API only accepts a fixed set).
const withType = (dataUrl: string, type: string): string =>
  dataUrl.startsWith(`data:${type};`)
    ? dataUrl
    : `data:${type};base64,${dataUrl.split(",")[1] || ""}`;

// Downscale an already-decoded bitmap to a data URL (long edge <= IMG_MAX_DIM)
// in an API-accepted type (png keeps alpha; everything else -> jpeg).
function bitmapToDataUrl(
  bitmap: ImageBitmap,
  preferType: "image/png" | "image/jpeg"
): string | null {
  const longEdge = Math.max(bitmap.width, bitmap.height) || 1;
  const scale = longEdge > IMG_MAX_DIM ? IMG_MAX_DIM / longEdge : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    (bitmap as any).close?.();
    return null;
  }
  if (preferType === "image/jpeg") {
    ctx.fillStyle = "#ffffff"; // JPEG has no alpha
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  (bitmap as any).close?.();
  return canvas.toDataURL(preferType, 0.85);
}

// Decode + downscale an image blob to an API-accepted data URL. Returns null if
// the browser can't decode it via canvas (e.g. an exotic/corrupt image) -
// reporting "couldn't load" beats sending bytes the API would reject.
async function imageToDataUrl(
  blob: Blob,
  preferType: "image/png" | "image/jpeg"
): Promise<string | null> {
  try {
    return bitmapToDataUrl(await createImageBitmap(blob), preferType);
  } catch {
    return null;
  }
}

// Lightweight OOXML text extraction: pull the run text out of each paragraph,
// joining runs within a paragraph and separating paragraphs with newlines. Good
// enough for study Q&A without pulling a heavy formatter.
function ooxmlToText(xml: string, paraTag: string, textTag: string): string {
  const out: string[] = [];
  const runRe = new RegExp(`<${textTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${textTag}>`, "g");
  for (const para of xml.split(new RegExp(`</${paraTag}>`))) {
    let m: RegExpExecArray | null;
    let line = "";
    runRe.lastIndex = 0;
    while ((m = runRe.exec(para)) !== null) line += decodeXml(m[1]);
    if (line.trim()) out.push(line);
  }
  return out.join("\n");
}

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");

async function extractDocx(blob: Blob): Promise<string> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const doc = zip.file("word/document.xml");
    if (!doc) return "";
    let xml = await doc.async("string");
    xml = xml.replace(/<w:tab\b[^>]*\/?>/g, "\t");
    return ooxmlToText(xml, "w:p", "w:t").slice(0, MAX_FILE_TEXT);
  } catch (e) {
    console.warn("docx extract failed:", e);
    return "";
  }
}

async function extractPptx(blob: Blob): Promise<string> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const slides = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort(
        (a, b) =>
          Number(a.match(/slide(\d+)/)![1]) - Number(b.match(/slide(\d+)/)![1])
      );
    const parts: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      const xml = await zip.files[slides[i]].async("string");
      const text = ooxmlToText(xml, "a:p", "a:t").trim();
      if (text) parts.push(`--- Slide ${i + 1} ---\n${text}`);
    }
    return parts.join("\n\n").slice(0, MAX_FILE_TEXT);
  } catch (e) {
    console.warn("pptx extract failed:", e);
    return "";
  }
}

const isTextLike = (mime: string, ext: string): boolean =>
  mime.startsWith("text/") ||
  /(json|xml|javascript|ecmascript|x-sh|x-python|x-ruby|x-perl|csv|yaml|markdown|html|sql|toml|x-c|x-java)/.test(
    mime
  ) ||
  TEXT_EXT.has(ext);

// Cheap binary-vs-text sniff for unknown extensions: mostly-printable -> text.
function looksLikeText(s: string): boolean {
  if (!s) return false;
  const sample = s.slice(0, 4000);
  let bad = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if ((c < 9 || (c > 13 && c < 32)) || c === 0xfffd) bad++;
  }
  return bad / sample.length < 0.1;
}

/**
 * Resolve one file (a Blob/File, plus its display name) into text + images the
 * model can consume. Never throws - on any failure it returns a short note.
 */
export async function resolveFileForAI(
  blob: Blob,
  name: string
): Promise<ResolvedFile> {
  const lower = (name || "").toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop() || "" : "";
  const mime = (blob.type || "").toLowerCase();
  const none: ResolvedFile = { text: "", images: [], note: "" };

  try {
    // --- Web-native images -> vision ---
    if (/^image\/(png|jpeg|gif|webp)$/.test(mime) || /^(png|jpe?g|gif|webp)$/.test(ext)) {
      const type =
        mime === "image/png" || ext === "png"
          ? "image/png"
          : mime === "image/gif" || ext === "gif"
            ? "image/gif"
            : mime === "image/webp" || ext === "webp"
              ? "image/webp"
              : "image/jpeg";
      const pref = type === "image/png" ? "image/png" : "image/jpeg";
      const url = await imageToDataUrl(blob, pref);
      if (url)
        return {
          text: "",
          images: [{ type: pref, base64: withType(url, pref) }],
          note: `[Image "${name}" attached below for you to view.]`,
        };
      return { ...none, note: `[Could not load image "${name}".]` };
    }

    // --- HEIC/HEIF (iPhone) -> JPEG -> vision ---
    if (mime.includes("heic") || mime.includes("heif") || ext === "heic" || ext === "heif") {
      const asPhoto = (url: string): ResolvedFile => ({
        text: "",
        images: [{ type: "image/jpeg", base64: withType(url, "image/jpeg") }],
        note: `[Photo "${name}" attached below for you to view.]`,
      });
      // Safari/iOS (where most HEICs originate) decode HEIC natively, so try
      // that first to avoid downloading the heavy heic2any/libheif decoder.
      try {
        const native = bitmapToDataUrl(
          await createImageBitmap(blob),
          "image/jpeg"
        );
        if (native) return asPhoto(native);
      } catch {
        /* not natively decodable - fall back to the WASM decoder below */
      }
      try {
        const heic2any = (await import("heic2any")).default as any;
        const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.85 });
        const jpeg = (Array.isArray(out) ? out[0] : out) as Blob;
        const url = await imageToDataUrl(jpeg, "image/jpeg");
        if (url) return asPhoto(url);
      } catch (e) {
        console.warn("HEIC convert failed:", e);
      }
      return { ...none, note: `[Could not convert photo "${name}".]` };
    }

    // --- Other raster images (bmp/tiff/avif...) -> canvas -> vision. SVG is
    // excluded here: it's readable XML (handled by the text path below) and
    // rasterizing it via canvas is unreliable. ---
    if (
      (mime.startsWith("image/") && !mime.includes("svg")) ||
      RASTER_IMG_EXT.test(lower)
    ) {
      const url = await imageToDataUrl(blob, "image/png");
      if (url)
        return {
          text: "",
          images: [{ type: "image/png", base64: withType(url, "image/png") }],
          note: `[Image "${name}" attached below for you to view.]`,
        };
      return { ...none, note: `[Could not load image "${name}".]` };
    }

    // --- PDF: text + figures, or page images if scanned ---
    if (mime.includes("pdf") || ext === "pdf") {
      const buf = await blob.arrayBuffer();
      const text = await extractPdfText(buf);
      if (text.trim().length >= 100) {
        // Text-based: send text, plus render ONLY the pages with figures.
        const { images, truncated } = await renderPdfToImages(buf, {
          onlyImagePages: true,
          maxPages: 8,
        });
        return {
          text: text.slice(0, MAX_FILE_TEXT),
          images,
          note: images.length
            ? `[${images.length} figure page(s) from "${name}" attached below${truncated ? " (more omitted)" : ""}.]`
            : text.length > MAX_FILE_TEXT
              ? "[Truncated file content]"
              : "",
        };
      }
      // Scanned / image-only: the pages ARE the content.
      const { images, truncated } = await renderPdfToImages(buf, {
        onlyImagePages: false,
        maxPages: 15,
      });
      if (images.length)
        return {
          text: "",
          images,
          note: `[Scanned PDF "${name}" attached as ${images.length} page image(s)${truncated ? " (truncated)" : ""}.]`,
        };
      return { ...none, note: `[Could not read PDF "${name}".]` };
    }

    // --- DOCX / PPTX ---
    if (ext === "docx" || mime.includes("wordprocessingml")) {
      const text = await extractDocx(blob);
      return text.trim()
        ? { text, images: [], note: "" }
        : { ...none, note: `[Could not extract text from "${name}".]` };
    }
    if (ext === "pptx" || mime.includes("presentationml")) {
      const text = await extractPptx(blob);
      return text.trim()
        ? { text, images: [], note: "" }
        : { ...none, note: `[Could not extract text from "${name}".]` };
    }

    // --- Text / code / data ---
    if (isTextLike(mime, ext)) {
      const text = await blob.text();
      return { text: text.slice(0, MAX_FILE_TEXT), images: [], note: "" };
    }

    // --- Unknown extension: sniff for text (catches unlabeled code/config) ---
    const maybe = await blob.text().catch(() => "");
    if (maybe && looksLikeText(maybe)) {
      return { text: maybe.slice(0, MAX_FILE_TEXT), images: [], note: "" };
    }

    return {
      ...none,
      note: `[File "${name}" (${mime || ext || "unknown type"}) isn't a readable text or image format.]`,
    };
  } catch (e) {
    console.warn("resolveFileForAI failed for", name, e);
    return { ...none, note: `[Could not read "${name}".]` };
  }
}
