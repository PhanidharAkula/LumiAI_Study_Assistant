import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { LumiStar } from "@shared/components/atlas";
import { keyPress } from "@shared/motion";
import type { UploadedFile } from "@shared/services/aiService";

interface ContextFile {
  name?: string;
  className?: string;
}

interface ChatMessageProps {
  message?: string;
  type?: string;
  isStreaming?: boolean;
  files?: UploadedFile[];
  contextFiles?: ContextFile[];
  statusLabel?: string;
  isLast?: boolean;
  onRetry?: () => void;
}

// Markdown + code-syntax-highlight styling, applied to the rendered markdown
// HTML via descendant arbitrary-variants (the HTML is generated at runtime by
// react-markdown, so it can't take per-element utility classes). Luminarium
// editorial prose: Fraunces headings over hairline rules, gold-leaf
// blockquotes, hairline tables, and night-plate code blocks whose
// rehype-highlight tokens use a midnight palette (AA on `night` #171326):
// keywords/tags gold #c79a33, strings/regexp sage #9ac2b9, comments
// starlight/55 (55% keeps AA - 45% drops below 4.5:1), functions/types
// #e3b34f, numbers/literals #d98e73, attrs #c9b8e8, deletions #e8a08c.
const PROSE = [
  // `min-w-0` lets this prose column shrink inside the flex message row, and
  // `wrap-break-word` wraps long unbroken tokens (URLs, hashes) so they can't push
  // horizontal overflow at 390px; code blocks scroll inside their own bubble.
  "relative min-w-0 max-w-full p-0 text-[15.5px] leading-[1.7] text-ink wrap-anywhere",
  // The last block's trailing margin is dropped so the AI "Copy" row sits the
  // same mt-2.5 below the text as the user-side copy button sits below its
  // bubble (otherwise the trailing p mb-4 made the Lumi gap larger).
  "[&>*:last-child]:mb-0",
  "[&_h1]:mt-6 [&_h1]:mb-4 [&_h1]:font-semibold [&_h1]:leading-[1.3] [&_h1]:tracking-[-0.01em] [&_h1]:text-ink [&_h1]:text-[1.5em] [&_h1]:border-0 [&_h1]:border-b [&_h1]:border-solid [&_h1]:border-line [&_h1]:pb-[0.35em]",
  "[&_h2]:mt-6 [&_h2]:mb-4 [&_h2]:font-semibold [&_h2]:leading-[1.3] [&_h2]:tracking-[-0.01em] [&_h2]:text-ink [&_h2]:text-[1.25em] [&_h2]:border-0 [&_h2]:border-b [&_h2]:border-solid [&_h2]:border-line [&_h2]:pb-[0.35em]",
  "[&_h3]:mt-5 [&_h3]:mb-4 [&_h3]:font-semibold [&_h3]:leading-[1.3] [&_h3]:text-ink [&_h3]:text-[1.1em]",
  "[&_h4]:mt-5 [&_h4]:mb-4 [&_h4]:font-semibold [&_h4]:leading-tight [&_h4]:text-ink [&_h4]:text-[1.05em]",
  // Preflight is off and the global reset sets no font-size, so without an
  // explicit size h5/h6 fall to the UA defaults (0.83em/0.67em) - i.e. SMALLER
  // than body. Pin them at/above body so the hierarchy never inverts.
  "[&_h5]:mt-6 [&_h5]:mb-4 [&_h5]:font-semibold [&_h5]:leading-tight [&_h5]:text-ink [&_h5]:text-[1em] [&_h6]:mt-6 [&_h6]:mb-4 [&_h6]:font-semibold [&_h6]:leading-tight [&_h6]:text-ink [&_h6]:text-[0.95em]",
  "[&_p]:mt-0 [&_p]:mb-4 [&_p]:text-ink",
  "[&_hr]:border-0 [&_hr]:h-px [&_hr]:bg-line [&_hr]:my-4.5",
  "[&_ul]:pl-[2em] [&_ul]:mt-0 [&_ul]:mb-4 [&_ol]:pl-[2em] [&_ol]:mt-0 [&_ol]:mb-4 [&_li]:mt-[0.25em]",
  // GFM task lists (`- [ ]` / `- [x]`): remark-gfm emits an <li class="task-list-item">
  // with a disabled checkbox. Drop the bullet, hang the row off the list edge so
  // the box aligns with the text column, and tint the checkbox brand-verdi.
  "[&_li.task-list-item]:list-none [&_li.task-list-item]:-ml-[1.45em] [&_li.task-list-item]:flex [&_li.task-list-item]:items-baseline [&_li.task-list-item]:gap-2 [&_.task-list-item_input[type=checkbox]]:relative [&_.task-list-item_input[type=checkbox]]:top-[0.15em] [&_.task-list-item_input[type=checkbox]]:m-0 [&_.task-list-item_input[type=checkbox]]:h-[0.95em] [&_.task-list-item_input[type=checkbox]]:w-[0.95em] [&_.task-list-item_input[type=checkbox]]:shrink-0 [&_.task-list-item_input[type=checkbox]]:cursor-default [&_.task-list-item_input[type=checkbox]]:accent-verdi",
  "[&_code]:bg-night/6 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_:not(pre)>code]:wrap-anywhere",
  "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-solid [&_pre]:border-line-night [&_pre]:bg-night [&_pre]:p-3.5 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-[1.65] [&_pre]:text-starlight",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px]",
  "[&_blockquote]:my-4 [&_blockquote]:rounded-r-md [&_blockquote]:border-0 [&_blockquote]:border-l-2 [&_blockquote]:border-solid [&_blockquote]:border-gold/60 [&_blockquote]:bg-cream/60 [&_blockquote]:py-2.5 [&_blockquote]:pl-4 [&_blockquote]:pr-3.5 [&_blockquote]:italic [&_blockquote]:text-ink [&_blockquote_p:last-of-type]:mb-0",
  "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg",
  "[&_table]:w-full [&_table]:border-collapse",
  "[&_th]:px-3 [&_th]:py-2.5 [&_th]:min-w-30 [&_th]:text-left [&_th]:text-ink [&_th]:font-semibold [&_th]:bg-sage/20 [&_th]:border-0 [&_th]:border-b [&_th]:border-r [&_th]:border-solid [&_th]:border-line [&_th:last-child]:border-r-0",
  "[&_td]:px-3 [&_td]:py-2.5 [&_td]:min-w-30 [&_td]:border-0 [&_td]:border-b [&_td]:border-r [&_td]:border-solid [&_td]:border-line [&_td]:bg-white/40 [&_td:last-child]:border-r-0 [&_tr:last-child_td]:border-b-0",
  "[&_tr:nth-child(even)_td]:bg-vellum/60",
  // KaTeX math (rehype-katex). Display math is centered with vertical breathing
  // room and scrolls horizontally so a wide equation can't blow out the 390px
  // column; inline math inherits the ink color and sits at ~1.05em so it reads
  // alongside the 15.5px prose without towering over it.
  "[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1 [&_.katex-display]:text-center [&_.katex]:text-[1.05em] [&_.katex]:text-ink [&_.katex]:leading-normal",
  "[&_strong]:font-semibold [&_strong]:text-ink [&_em]:text-ink",
  "[&_.hashtag]:font-medium [&_.hashtag]:text-verdi [&_.mention]:font-medium [&_.mention]:text-verdi",
  "[&_.hljs-comment]:text-starlight/55 [&_.hljs-comment]:italic [&_.hljs-quote]:text-starlight/55 [&_.hljs-quote]:italic [&_.hljs-keyword]:text-gold [&_.hljs-keyword]:font-semibold [&_.hljs-string]:text-sage [&_.hljs-title]:text-[#e3b34f] [&_.hljs-function]:text-[#e3b34f] [&_.hljs-number]:text-[#d98e73] [&_.hljs-attr]:text-[#c9b8e8]",
  "[&_.hljs-built_in]:text-[#e3b34f] [&_.hljs-type]:text-[#e3b34f] [&_.hljs-class]:text-[#e3b34f] [&_.hljs-literal]:text-[#d98e73] [&_.hljs-symbol]:text-[#d98e73] [&_.hljs-bullet]:text-[#d98e73] [&_.hljs-name]:text-gold [&_.hljs-selector-tag]:text-gold [&_.hljs-section]:text-gold [&_.hljs-attribute]:text-[#c9b8e8] [&_.hljs-variable]:text-starlight [&_.hljs-template-variable]:text-starlight [&_.hljs-params]:text-starlight [&_.hljs-regexp]:text-sage [&_.hljs-meta]:text-starlight/70 [&_.hljs-doctag]:text-starlight/70 [&_.hljs-addition]:text-sage [&_.hljs-addition]:bg-sage/10 [&_.hljs-deletion]:text-[#e8a08c] [&_.hljs-deletion]:bg-vermilion/15",
].join(" ");

// Escape currency dollar signs so remark-math doesn't pair "$5 ... $10" into an
// inline-math span (which renders the text between as italic math). Uses the
// SAME currency-vs-math test as the copy path (markdownToPlainText) so the
// screen and the clipboard agree: a $...$ span is left as real math unless it
// looks like currency, in which case its $ are escaped (KaTeX then ignores them
// and they render as literal dollar signs).
const escapeCurrency = (md: string): string =>
  md.replace(/\$([^$\n]+?)\$/g, (m, inner) => {
    const s = String(inner);
    const isMath =
      !/^\s|\s$/.test(s) && // padded -> currency
      (/[\^_\\{}]/.test(s) || // math symbols
        /^[^\d]/.test(s) || // starts non-digit
        /^\d[A-Za-z]/.test(s) || // digit then letter (3x)
        /[A-Za-z]/.test(s)); // digit-led but has a letter (5x)
    return isMath ? m : "\\$" + s + "\\$";
  });

// Small ghost key - copy actions on parchment. The lift comes from framer
// (`keyPress`); CSS animates color/border only (motion doctrine §7).
const COPY_BTN =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-solid border-line bg-transparent px-2 py-1.5 text-[12px] text-muted transition-[color,background-color,border-color] duration-150 hover:border-ink/30 hover:bg-vellum hover:text-ink";

const ChatMessage = ({
  message,
  type,
  isStreaming = false,
  files = [],
  contextFiles = [],
  statusLabel,
  isLast = false,
  onRetry,
}: ChatMessageProps) => {
  const isUser = type === "user";
  const isError = type === "error";
  const isAI = type === "assistant";
  const [copySuccessFull, setCopySuccessFull] = useState(false);
  const [copySuccessUser, setCopySuccessUser] = useState(false);
  const [copyingCode, setCopyingCode] = useState<string | null>(null);
  // The rendered-markdown container, grabbed for a rich (HTML) copy.
  const proseRef = useRef<HTMLDivElement>(null);

  const copyToClipboard = (plain: string, html?: string): Promise<void> => {
    // Rich + plain: a real <table>, headings, lists and code paste into
    // Docs/Notion/Word, while plain-text targets fall back to the readable
    // (monospace-aligned) plain version. The promise REJECTS on a real failure
    // so the caller never flashes a false "copied" check.
    if (
      html &&
      typeof ClipboardItem !== "undefined" &&
      navigator.clipboard?.write
    ) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      });
      // Fall back to plain text if a multi-type write is rejected; a final
      // failure still propagates.
      return navigator.clipboard
        .write([item])
        .catch(() => navigator.clipboard.writeText(plain));
    }
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(plain);
    }
    return Promise.reject(new Error("Clipboard API unavailable"));
  };

  // Utility: extract plain text from React nodes / arrays / markdown node structures
  const getPlainText = (node: any): string => {
    if (node == null) return "";
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(getPlainText).join("");
    // React element
    if (React && React.isValidElement && React.isValidElement(node)) {
      return getPlainText((node.props as any) && (node.props as any).children);
    }
    // Generic object from remark/rehype
    if (typeof node === "object") {
      if (typeof node.value === "string") return node.value;
      if (node.children) return getPlainText(node.children);
    }
    return "";
  };

  // Convert Lumi's Markdown answer to clean plain text for copying: strip
  // heading/emphasis/link/list/table syntax, keep code blocks verbatim and math
  // readable. Students want the prose, not the raw Markdown source.
  const markdownToPlainText = (md: string): string => {
    if (!md || typeof md !== "string") return "";
    const stash: string[] = [];
    const SENT = String.fromCharCode(0); // NUL - cannot occur in markdown text
    let t = md;
    // Protect code (fenced + inline) so their contents aren't stripped.
    t = t.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_m, code) => {
      stash.push(String(code).replace(/\n$/, ""));
      return SENT + (stash.length - 1) + SENT;
    });
    t = t.replace(/`([^`\n]+)`/g, (_m, code) => {
      stash.push(String(code));
      return SENT + (stash.length - 1) + SENT;
    });
    t = t
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images -> alt text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> link text
      // Headings/blockquotes: trim only horizontal space ([ \t]) so the regex
      // can't swallow the preceding blank line and glue blocks together on copy.
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "") // headings
      .replace(/^[ \t]{0,3}(?:>[ \t]?)+/gm, "") // blockquotes (incl. nested >)
      // Thematic breaks (***, ___, ---, * * *) BEFORE emphasis - otherwise the
      // emphasis rules chew a run of * / _ down into a stray bullet/underscore.
      .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, "")
      .replace(/~~(?=\S)(.*?\S)~~/g, "$1") // strikethrough
      .replace(/(\*\*\*|\*\*|\*)(?=\S)(.*?\S)\1/g, "$2") // bold/italic (asterisk)
      // Underscore emphasis is intentionally NOT stripped: `__init__`/`__name__`
      // dunders and snake_case identifiers are far more common in study prose
      // than `_italic_`, and mangling them silently corrupts copied answers.
      .replace(/^([ \t]*)[-*+][ \t]+/gm, "$1• "); // bullet markers
    // Inline math unwrap (shared so table cells get their FINAL width before
    // padding): real math (incl. digit-led like $3x$, $5+x$, $2\pi r$) is
    // unwrapped; currency ($5, "$5 and $10") and lone amounts are kept.
    const unwrapInlineMath = (str: string) =>
      str.replace(/\$([^$\n]+?)\$/g, (m, inner) => {
        const s = String(inner);
        if (/^\s|\s$/.test(s)) return m; // padded -> currency-ish, keep
        if (/[\^_\\{}]/.test(s)) return s; // has math symbols
        if (/^[^\d]/.test(s)) return s; // starts non-digit
        if (/^\d[A-Za-z]/.test(s)) return s; // digit then letter, e.g. 3x
        if (/[A-Za-z]/.test(s)) return s; // digit-led but contains a letter, e.g. 5+x
        return m; // pure number ($5) -> currency, keep
      });
    // Tables -> aligned columns. Only a real block (a |-bearing header line
    // immediately followed by a separator row) is converted, so prose that
    // merely contains a | is never touched. Handles outer-pipe and pipe-less,
    // and pads each column to its widest cell so it lines up in monospace.
    const isTableSep = (l: string) =>
      /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/.test(l);
    const splitCells = (l: string) =>
      l
        .replace(/^[ \t]*\|/, "")
        .replace(/\|[ \t]*$/, "")
        .split("|")
        .map((c) => unwrapInlineMath(c.trim()));
    const lines = t.split("\n");
    const tableOut: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (
        i + 1 < lines.length &&
        /\|/.test(lines[i]) &&
        isTableSep(lines[i + 1])
      ) {
        const rows: string[][] = [splitCells(lines[i])]; // header
        i++; // skip the separator row
        while (i + 1 < lines.length && /\|/.test(lines[i + 1])) {
          i++;
          rows.push(splitCells(lines[i]));
        }
        const cols = Math.max(...rows.map((r) => r.length));
        const widths: number[] = [];
        for (let c = 0; c < cols; c++) {
          widths[c] = Math.max(...rows.map((r) => (r[c] || "").length));
        }
        for (const r of rows) {
          tableOut.push(
            r
              .map((cell, c) =>
                c < cols - 1 ? (cell || "").padEnd(widths[c]) : cell || ""
              )
              .join("  ")
              .replace(/[ \t]+$/, "") // never leave trailing padding
          );
        }
      } else {
        tableOut.push(lines[i]);
      }
    }
    // Non-table math (table cells were already unwrapped above).
    t = unwrapInlineMath(
      tableOut.join("\n").replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    );
    // Restore protected code verbatim (the NUL sentinel can't collide with text).
    t = t.replace(
      new RegExp(SENT + "(\\d+)" + SENT, "g"),
      (_m, i) => stash[Number(i)] ?? ""
    );
    // Per-line trailing-space trim + strip leading/trailing blank lines, but
    // KEEP leading spaces on content lines: a table whose header has an empty
    // leading cell pads that header so its columns sit over the data, and a
    // whole-string .trim() would strip the pad and shift the header out of line.
    return t
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((l) => l.replace(/[ \t]+$/, ""))
      .join("\n")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "");
  };

  const copyFull = (text: any) => {
    const plain = markdownToPlainText(getPlainText(text));
    // Also offer the rendered HTML so tables paste as REAL tables (and headings
    // / lists / code keep their structure) in rich editors. Clone + strip the
    // per-code-block copy buttons and the visual KaTeX layer (keep the semantic
    // MathML) so the paste is clean.
    let html: string | undefined;
    const node = proseRef.current;
    if (node) {
      const clone = node.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("button, .katex-html").forEach((el) => el.remove());
      html = clone.innerHTML;
    }
    copyToClipboard(plain, html)
      .then(() => {
        setCopySuccessFull(true);
        setTimeout(() => setCopySuccessFull(false), 2000);
      })
      .catch((err) => console.error("Could not copy: ", err));
  };

  const copyUser = (text: any) => {
    const plain = getPlainText(text);
    copyToClipboard(plain)
      .then(() => {
        setCopySuccessUser(true);
        setTimeout(() => setCopySuccessUser(false), 2000);
      })
      .catch((err) => console.error("Could not copy: ", err));
  };

  const handleCopyFullResponse = () => {
    copyFull(message);
  };

  const renderContent = () => {
    if (isError) {
      return (
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2 text-left text-vermilion">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p className="m-0 text-[14px] leading-[1.55]">{message}</p>
          </div>
          {/* Retry only on the LAST message and only when it's an error: drop it
              and re-run the failed turn. Never shown for a mid-chat error. */}
          {isLast && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={COPY_BTN}
              aria-label="Retry message"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              <span>Retry</span>
            </button>
          ) : null}
        </div>
      );
    } else if (isUser) {
      // Display user message exactly as entered, preserving line breaks
      return (
        <div className="group/uw flex w-full flex-col items-end">
          <div className="box-border block max-w-full whitespace-pre-wrap wrap-anywhere rounded-xl bg-ink px-5 py-3.5 text-[15px] leading-[1.65] text-cream shadow-plate [&::-webkit-scrollbar]:hidden">
            {message}
          </div>
          {/* Copy sits in its own normal-flow row under the bubble (mirrors the
              AI "Copy full response" row) so it reserves its own height and can
              never overlap the bubble or the next message. Hidden until hover on
              pointer devices, always visible on mobile (max-md). */}
          <div className="pointer-events-none mt-2.5 flex -translate-y-1 justify-end opacity-0 [transition:opacity_0.12s_ease,transform_0.12s_ease] group-hover/uw:pointer-events-auto group-hover/uw:translate-y-0 group-hover/uw:opacity-100 max-md:pointer-events-auto max-md:translate-y-0 max-md:opacity-100">
            <motion.button
              type="button"
              className={COPY_BTN}
              onClick={(e) => {
                e.stopPropagation();
                copyUser(message);
              }}
              aria-label="Copy user message"
              {...keyPress}
            >
              {copySuccessUser ? (
                <span className="flex items-center gap-1.25">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="9"
                      y="9"
                      width="13"
                      height="13"
                      rx="2"
                      ry="2"
                    ></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </>
              )}
            </motion.button>
          </div>
        </div>
      );
    } else {
      return (
        <div className={PROSE} ref={proseRef}>
          {/* Show "Thinking..." animation when streaming with no content yet */}
          {isStreaming && (!message || message.trim() === "") ? (
            <div className="flex items-center gap-0.5 text-[15px] italic text-muted">
              <span>{statusLabel || "Thinking"}</span>
              <span className="ml-0.5 flex gap-0.5">
                <span className="animate-thinking-fade opacity-0">.</span>
                <span className="animate-thinking-fade opacity-0 [animation-delay:0.2s]">
                  .
                </span>
                <span className="animate-thinking-fade opacity-0 [animation-delay:0.4s]">
                  .
                </span>
              </span>
            </div>
          ) : (
            <>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeHighlight, rehypeKatex]}
                components={{
                  // `node` is destructured out (not a valid DOM attr) so it is
                  // never spread onto the native elements below - that spread
                  // was the source of React "invalid prop `node`" dev warnings.
                  pre({ node, children, ...props }: any) {
                    const child = Array.isArray(children)
                      ? children[0]
                      : children;
                    const childClass = child?.props?.className || "";
                    // A fenced block WITH a language is already fully styled
                    // (container + header + copy button) by the `code` component
                    // below. Render it as-is; wrapping it in another <pre> would
                    // stack a second background. Language-less blocks keep the
                    // styled <pre>.
                    if (
                      typeof childClass === "string" &&
                      /language-/.test(childClass)
                    ) {
                      return <>{children}</>;
                    }
                    return <pre {...props}>{children}</pre>;
                  },
                  table({ node, children, ...props }: any) {
                    // Wrap the table so its rounded corners + outer border match
                    // the code blocks. The wrapper owns the border/radius; the
                    // cells (below) draw only the inner grid lines, so the edge
                    // never doubles. Inner div scrolls wide tables.
                    return (
                      <div className="my-4 overflow-hidden rounded-lg border border-solid border-line">
                        <div className="overflow-x-auto">
                          <table {...props}>{children}</table>
                        </div>
                      </div>
                    );
                  },
                  code({ inline, node, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = getPlainText(children).replace(
                      /\n$/,
                      ""
                    );
                    // Unique per block (source offset) so two same-language
                    // blocks don't share the "Copied" check state.
                    const blockKey = String(
                      node?.position?.start?.offset ?? codeString
                    );

                    if (!inline && match) {
                      return (
                        <div className="relative my-4 overflow-hidden rounded-lg border border-solid border-line-night bg-night [&_pre]:my-0! [&_pre]:rounded-none! [&_pre]:border-0!">
                          <div className="flex items-center justify-between border-0 border-b border-solid border-line-night bg-white/4 px-3.5 py-2">
                            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-starlight/60">
                              {match[1]}
                            </span>
                            <button
                              className="flex cursor-pointer items-center justify-center rounded-md border border-solid border-transparent bg-transparent p-1.25 text-starlight/60 transition-colors duration-150 hover:border-line-night hover:bg-white/6 hover:text-starlight"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(codeString)
                                  .then(() => {
                                    setCopyingCode(blockKey);
                                    setTimeout(
                                      () => setCopyingCode(null),
                                      2000
                                    );
                                  })
                                  .catch((err) =>
                                    console.error("Could not copy: ", err)
                                  );
                              }}
                              aria-label="Copy code"
                            >
                              {copyingCode === blockKey ? (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect
                                    x="9"
                                    y="9"
                                    width="13"
                                    height="13"
                                    rx="2"
                                    ry="2"
                                  ></rect>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                              )}
                            </button>
                          </div>
                          <pre className={className}>
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                        </div>
                      );
                    }
                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  a: ({ node, href, ...props }: any) => {
                    // Only open external (http) links in a new tab; in-page
                    // anchors (footnotes, #refs) must stay in the same view.
                    const external =
                      typeof href === "string" && /^(https?:)?\/\//.test(href);
                    return (
                      <a
                        {...props}
                        href={href}
                        {...(external
                          ? { target: "_blank", rel: "noreferrer noopener" }
                          : {})}
                        className="text-verdi no-underline transition-colors duration-200 hover:text-gold-deep"
                      >
                        {props.children}
                      </a>
                    );
                  },
                  // Render #hashtags / @mentions as styled spans using React
                  // nodes - never innerHTML, so any literal markup stays inert
                  // (no dangerouslySetInnerHTML = no XSS sink). Walk EVERY string
                  // child (not only a wholly-plain paragraph) so tags style even
                  // alongside bold/links/code; skip hex colors and bare numbers
                  // (#fff, #1) so they aren't mistaken for tags.
                  p: ({ node, children, ...props }: any) => (
                    <p {...props}>
                      {React.Children.map(children, (child, ci) =>
                        typeof child === "string"
                          ? child
                              .split(/(#\w+|@\w+)/g)
                              .map((part: string, i: number) =>
                                /^#\w+$/.test(part) &&
                                !/^#(?:[0-9a-fA-F]{3,8}|\d+)$/.test(part) ? (
                                  <span key={`${ci}-${i}`} className="hashtag">
                                    {part}
                                  </span>
                                ) : /^@\w+$/.test(part) ? (
                                  <span key={`${ci}-${i}`} className="mention">
                                    {part}
                                  </span>
                                ) : (
                                  part
                                )
                              )
                          : child
                      )}
                    </p>
                  ),
                }}
              >
                {escapeCurrency(message as string)}
              </ReactMarkdown>
              {isStreaming && (
                <span
                  className="ml-0.5 inline-block h-3.75 w-0.5 animate-blink rounded-full bg-gold align-middle"
                  aria-hidden="true"
                ></span>
              )}
            </>
          )}
        </div>
      );
    }
  };

  return (
    <motion.div
      className={`group/msg max-w-full ${
        isUser
          ? "mb-5 w-auto max-w-[70%] self-end max-md:max-w-[85%]"
          : isError
            ? "mb-2 self-start text-vermilion"
            : "mb-2 self-start max-md:self-stretch"
      }`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 20,
      }}
    >
      <div
        className={
          isUser
            ? "flex w-full flex-col items-end gap-0 pt-3 max-md:justify-end"
            : "flex gap-3"
        }
      >
        {!isError && isUser ? (
          <>
            {/* Render context files ABOVE the message (tagged via context selector) */}
            {contextFiles && contextFiles.length > 0 && (
              <div className="mb-2.5 ml-auto rounded-xl border border-solid border-line bg-vellum/80 px-3.5 py-2.5">
                <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path>
                    <path d="M7 7h.01"></path>
                  </svg>
                  <span>Context</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {contextFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1.5 rounded-full border border-solid border-ink/25 bg-white/60 px-2.5 py-1 font-mono text-[11.5px] text-ink"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="shrink-0 opacity-70"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                      <span className="max-w-50 truncate font-medium">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-muted">
                        · {file.className}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Render attached files ABOVE the message (locally uploaded) */}
            {files && files.length > 0 && (
              <div className="mb-2.5 ml-auto rounded-xl border border-solid border-gold-deep/30 bg-gold/10 px-3.5 py-2.5">
                <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-gold-deep">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                  </svg>
                  <span>Uploaded</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="inline-block max-w-50 overflow-hidden rounded-lg border border-solid border-gold-deep/40 bg-white/70"
                    >
                      {file.base64 &&
                      file.type &&
                      file.type.startsWith("image/") ? (
                        <img
                          src={file.base64}
                          alt={file.name}
                          className="block h-auto max-h-50 w-full object-contain"
                        />
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-1.5 font-mono text-[11.5px] text-gold-deep">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="shrink-0"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                          </svg>
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                            {file.name}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top spacing now lives on the outer column (above), so any pinned
                context/file cards share it. This wrapper carries only the bubble
                + its copy row, which leaves the context card's mb-2.5 as the sole
                gap to the bubble - exactly mirroring the copy row's mt-2.5. */}
            <div className="relative flex w-full max-w-full justify-end pb-1">
              {renderContent()}
            </div>
          </>
        ) : !isError ? (
          <div className="relative w-full max-w-full pt-1 pb-1">
            {/* Editorial byline - Lumi writes on the page, no bubble. */}
            {isAI && (
              <div className="mb-2.5 flex items-center gap-2">
                <LumiStar size={22} />
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold-deep">
                  Lumi
                </span>
              </div>
            )}
            {renderContent()}
            {isAI && message && !isStreaming && (
              <div className="pointer-events-none mt-2.5 flex -translate-y-1 justify-start opacity-0 [transition:opacity_0.12s_ease,transform_0.12s_ease] group-hover/msg:pointer-events-auto group-hover/msg:translate-y-0 group-hover/msg:opacity-100 max-md:pointer-events-auto max-md:translate-y-0 max-md:opacity-100">
                <motion.button
                  type="button"
                  className={COPY_BTN}
                  onClick={handleCopyFullResponse}
                  aria-label="Copy full response"
                  {...keyPress}
                >
                  {copySuccessFull ? (
                    <span className="flex items-center gap-1.25">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        ></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </>
                  )}
                </motion.button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative w-full max-w-full pt-1 pb-1">
            {renderContent()}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ChatMessage;
