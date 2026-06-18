import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Constellation, UI, btnClass } from "@shared/components/atlas";
import { CloseButton, IconButton, Spinner } from "@shared/components/controls";
import { pressLift } from "@shared/motion";
import { useEscapeToClose, useScrollLock } from "@shared/hooks/overlay";
import { isTextLikeFile } from "@shared/lib/fileExtract";

interface FileMeta {
  name: string;
  type?: string;
  size: number;
  [key: string]: unknown;
}

interface FileViewerProps {
  file: FileMeta | null;
  url: string | null;
  onClose: () => void;
}

const FileViewer = ({ file, url, onClose }: FileViewerProps) => {
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState(false);
  // PDFs are fetched into a SAME-ORIGIN blob and framed from a blob: URL.
  // Supabase serves the signed URL with a header that blocks cross-origin
  // framing ("This page has been blocked by Chrome"), so framing it directly is
  // blank; a blob: URL is same-origin (and allowed by the CSP frame-src).
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState(false);

  // Fullscreen takeover: lock background scroll and close on Escape (shared,
  // reference-counted/stacked so a dialog above it pops first).
  useScrollLock(true);
  useEscapeToClose(true, onClose);

  // Text/code/data files preview as text (fetched below); images + PDFs render
  // directly. Everything else falls back to the download card.
  const isText =
    !!file &&
    !file.type?.includes("image") &&
    !file.type?.includes("pdf") &&
    isTextLikeFile(file.name, file.type);
  const isGenericFile = file
    ? !(file.type?.includes("image") || file.type?.includes("pdf") || isText)
    : false;

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch the text for text/code/data previews and render it (escaped) in a
  // <pre> - reliable regardless of the stored MIME, and safer than framing the
  // raw file. Capped so a huge file can't freeze the viewer.
  useEffect(() => {
    if (!isText || !url) return;
    let cancelled = false;
    setLoading(true);
    setTextContent(null);
    setTextError(false);
    fetch(url)
      .then((r) =>
        r.ok ? r.text() : Promise.reject(new Error(String(r.status)))
      )
      .then((t) => {
        if (cancelled) return;
        const MAX = 500_000;
        setTextContent(
          t.length > MAX ? t.slice(0, MAX) + "\n\n[Preview truncated]" : t
        );
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setTextError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isText, url]);

  // Fetch a PDF into a blob and frame a same-origin blob: URL (see note above).
  useEffect(() => {
    if (!file?.type?.includes("pdf") || !url) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setPdfUrl(null);
    setPdfError(false);
    fetch(url)
      .then((r) =>
        r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))
      )
      .then((blob) => {
        if (cancelled) return;
        // Force application/pdf so the browser renders inline even if the stored
        // object came back as a generic type.
        const pdf =
          blob.type === "application/pdf"
            ? blob
            : new Blob([blob], { type: "application/pdf" });
        objectUrl = URL.createObjectURL(pdf);
        setPdfUrl(objectUrl);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPdfError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file?.type, url]);

  const handleSmallButtonDownload = async () => {
    if (!url || !file?.name) return;
    try {
      const response = await fetch(url, { mode: "cors" });
      const blob = await response.blob();
      const objectURL = URL.createObjectURL(blob);

      const tempLink = document.createElement("a");
      tempLink.href = objectURL;
      tempLink.download = file.name;

      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      URL.revokeObjectURL(objectURL);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const renderFileContent = () => {
    if (!file || !url) return null;

    if (file.type?.includes("image")) {
      return (
        <div className="flex max-h-full max-w-full items-center justify-center overflow-auto">
          <img
            src={url}
            alt={file.name}
            onLoad={() => setLoading(false)}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      );
    }

    if (file.type?.includes("pdf")) {
      if (pdfError) {
        return (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="m-0 text-[15px] text-muted">
              Couldn&rsquo;t load the preview.
            </p>
            <button
              type="button"
              onClick={handleSmallButtonDownload}
              className={btnClass("gold")}
            >
              Download PDF
            </button>
          </div>
        );
      }
      if (!pdfUrl) return null; // fetching; the shared spinner covers the wait
      // Frame the SAME-ORIGIN blob: URL (Supabase blocks cross-origin framing of
      // the signed URL). The sandbox keeps a user PDF from touching the app; the
      // blob is our own fetched bytes, so allow-same-origin is safe and needed.
      return (
        <iframe
          src={`${pdfUrl}#toolbar=0`}
          sandbox="allow-same-origin allow-scripts allow-popups allow-downloads"
          className="h-full w-full border-none"
          onLoad={() => setLoading(false)}
          title={file.name}
        />
      );
    }

    if (isText) {
      if (loading) return null;
      return (
        // Rendered as escaped text in a <pre> (not framed), so a malicious
        // upload can't execute scripts - and any text/code/data format previews,
        // not just .txt.
        <div className="h-full w-full overflow-auto bg-white">
          {textError ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-[14px] text-muted">
              Couldn't load a preview for this file.
            </div>
          ) : (
            <pre className="m-0 whitespace-pre-wrap wrap-break-word p-4 font-mono text-[13px] leading-[1.6] text-ink">
              {textContent}
            </pre>
          )}
        </div>
      );
    }

    if (isGenericFile) {
      if (loading) return null;
      return (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center max-md:px-5 max-md:py-10">
          <Constellation
            name={file.name}
            size={120}
            className="text-ink/30 max-md:h-24 max-md:w-24"
          />
          <p className={`mt-4 ${UI.overlineMuted}`}>No preview available</p>
          <p className="mt-2 max-w-105 wrap-break-word font-display text-[19px] font-semibold leading-[1.3] text-ink max-md:max-w-70 max-md:text-[17px]">
            {file.name}
          </p>
          <p className="mt-1.5 text-[13px] text-muted">
            {(file.size / 1024).toFixed(1)} KB • {file.type || "Unknown type"}
          </p>
          <motion.a
            href={url}
            download={file.name}
            className={`${btnClass("primary")} mt-7 no-underline`}
            target="_blank"
            rel="noreferrer"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            {...pressLift}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download File
          </motion.a>
        </div>
      );
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-night/70 backdrop-blur-[3px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative flex h-[85dvh] w-[90%] max-w-250 flex-col overflow-hidden rounded-xl border border-solid border-line bg-vellum shadow-float max-md:h-[90dvh] max-md:w-[calc(100%-40px)]"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-0 border-b border-solid border-line bg-cream/60 px-5 py-3 max-md:gap-3 max-md:px-4">
          <div className="min-w-0 flex-1">
            <p className={UI.overlineMuted}>Viewing</p>
            <h3 className="m-0 mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap font-display text-[17px] font-semibold leading-snug text-ink max-md:text-[15px]">
              {file?.name}
            </h3>
          </div>
          <div className="flex shrink-0 gap-2.5">
            {!isGenericFile && (
              <IconButton
                variant="ghost"
                size="keyLg"
                label="Download file"
                onClick={handleSmallButtonDownload}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </IconButton>
            )}

            <CloseButton label="Close viewer" onClick={onClose} />
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center overflow-auto p-4 max-md:p-3">
          <div
            className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-solid border-line ${
              isGenericFile ? "" : "bg-white"
            }`}
          >
            {loading && <Spinner overlay label="Loading file" />}
            {renderFileContent()}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default FileViewer;
