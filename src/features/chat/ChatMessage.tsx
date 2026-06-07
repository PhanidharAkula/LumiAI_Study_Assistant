import React, { useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { UploadedFile } from "@shared/services/aiService";

interface ContextFile {
  name?: string;
  className?: string;
}

interface ChatMessageProps {
  message?: string;
  type?: string;
  errorType?: string;
  isStreaming?: boolean;
  files?: UploadedFile[];
  contextFiles?: ContextFile[];
}

// Markdown + code-syntax-highlight styling, applied to the rendered markdown
// HTML via descendant arbitrary-variants (the HTML is generated at runtime by
// react-markdown, so it can't take per-element utility classes). Effective
// values reproduce the original ChatMessage.css (incl. its specificity-resolved
// heading borders/colors and the rehype-highlight token palette).
const PROSE = [
  "relative p-0 text-[16px] leading-[1.5] text-black",
  "[&_h1]:mt-6 [&_h1]:mb-4 [&_h1]:font-semibold [&_h1]:leading-[1.25] [&_h1]:text-[#0f172a] [&_h1]:text-[1.5em] [&_h1]:border-0 [&_h1]:border-b [&_h1]:border-solid [&_h1]:border-black/10 [&_h1]:pb-[0.35em]",
  "[&_h2]:mt-6 [&_h2]:mb-4 [&_h2]:font-semibold [&_h2]:leading-[1.25] [&_h2]:text-[#0f172a] [&_h2]:text-[1.25em] [&_h2]:border-0 [&_h2]:border-b [&_h2]:border-solid [&_h2]:border-black/10 [&_h2]:pb-[0.35em]",
  "[&_h3]:mt-5 [&_h3]:mb-4 [&_h3]:font-semibold [&_h3]:leading-[1.25] [&_h3]:text-black [&_h3]:text-[1.1em]",
  "[&_h4]:mt-5 [&_h4]:mb-4 [&_h4]:font-semibold [&_h4]:leading-[1.25] [&_h4]:text-black",
  "[&_h5]:mt-6 [&_h5]:mb-4 [&_h5]:font-semibold [&_h5]:leading-[1.25] [&_h6]:mt-6 [&_h6]:mb-4 [&_h6]:font-semibold [&_h6]:leading-[1.25]",
  "[&_p]:mt-0 [&_p]:mb-4 [&_p]:text-[#111827]",
  "[&_hr]:border-0 [&_hr]:h-px [&_hr]:bg-black/[0.08] [&_hr]:my-[18px]",
  "[&_ul]:pl-[2em] [&_ul]:mt-0 [&_ul]:mb-4 [&_ol]:pl-[2em] [&_ol]:mt-0 [&_ol]:mb-4 [&_li]:mt-[0.25em]",
  "[&_code]:bg-black/[0.03] [&_code]:rounded-[3px] [&_code]:font-mono [&_code]:text-[medium] [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:my-[15px] [&_blockquote]:pl-[15px] [&_blockquote]:text-black [&_blockquote]:italic [&_blockquote]:border-0 [&_blockquote]:border-l-[3px] [&_blockquote]:border-solid [&_blockquote]:border-black/20",
  "[&_table]:w-full [&_table]:my-[15px] [&_table]:border-collapse",
  "[&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-ink [&_th]:font-bold [&_th]:bg-[rgba(147,193,193,0.14)] [&_th]:border [&_th]:border-solid [&_th]:border-[rgba(147,193,193,0.22)]",
  "[&_td]:px-3 [&_td]:py-2.5 [&_td]:border [&_td]:border-solid [&_td]:border-[rgba(227,235,235,0.7)] [&_td]:bg-[rgba(255,255,255,0.98)]",
  "[&_tr:nth-child(even)]:bg-[rgba(147,193,193,0.06)]",
  "[&_strong]:font-semibold [&_strong]:text-black [&_em]:text-black",
  "[&_.hashtag]:font-medium [&_.hashtag]:text-black [&_.mention]:font-medium [&_.mention]:text-black",
  "[&_.hljs-comment]:text-[#6b7280] [&_.hljs-quote]:text-[#708090] [&_.hljs-keyword]:text-[#7c3aed] [&_.hljs-keyword]:font-semibold [&_.hljs-string]:text-[#059669] [&_.hljs-title]:text-[#1e293b] [&_.hljs-function]:text-[#0ea5e9] [&_.hljs-number]:text-[#d946ef] [&_.hljs-attr]:text-[#b45309]",
].join(" ");

const COPY_BTN =
  "inline-flex items-center gap-1.5 rounded-md border border-solid border-black/[0.06] bg-transparent px-2 py-1.5 text-[12px] [transition:all_0.12s_ease] hover:-translate-y-1 hover:bg-cream";

const ChatMessage = ({
  message,
  type,
  errorType,
  isStreaming = false,
  files = [],
  contextFiles = [],
}: ChatMessageProps) => {
  const isUser = type === "user";
  const isTyping = type === "typing";
  const isError = type === "error";
  const isAI = type === "assistant";
  const [copySuccessFull, setCopySuccessFull] = useState(false);
  const [copySuccessUser, setCopySuccessUser] = useState(false);
  const [copyingCode, setCopyingCode] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    return navigator.clipboard.writeText(text).catch((err: unknown) => {
      console.error("Could not copy text: ", err);
    });
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

  const copyFull = (text: any) => {
    const plain = getPlainText(text);
    copyToClipboard(plain).then(() => {
      setCopySuccessFull(true);
      setTimeout(() => setCopySuccessFull(false), 2000);
    });
  };

  const copyUser = (text: any) => {
    const plain = getPlainText(text);
    copyToClipboard(plain).then(() => {
      setCopySuccessUser(true);
      setTimeout(() => setCopySuccessUser(false), 2000);
    });
  };

  const handleCopyFullResponse = () => {
    copyFull(message);
  };

  const renderContent = () => {
    if (isTyping) {
      return (
        <div className="flex items-center justify-center gap-1">
          <span className="inline-block h-2 w-2 animate-typing-bounce rounded-full bg-muted"></span>
          <span className="inline-block h-2 w-2 animate-typing-bounce rounded-full bg-muted [animation-delay:0.2s]"></span>
          <span className="inline-block h-2 w-2 animate-typing-bounce rounded-full bg-muted [animation-delay:0.4s]"></span>
        </div>
      );
    } else if (isError) {
      const icon =
        errorType === "quota" ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2v2"></path>
            <path d="M12 8v2"></path>
            <path d="M12 14v2"></path>
            <path d="M12 20v2"></path>
            <path d="M18.4 4.6a2 2 0 0 0-2.8 2.8"></path>
            <path d="M5.6 7.4a2 2 0 0 0 2.8-2.8"></path>
            <path d="M18.4 19.4a2 2 0 0 1-2.8-2.8"></path>
            <path d="M5.6 16.6a2 2 0 0 1-2.8 2.8"></path>
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        );

      return (
        <div
          className={`flex items-center gap-2 text-[#B91C1C] [&_p]:m-0 [&_svg]:shrink-0 ${
            errorType === "quota"
              ? "flex-col p-[5px] text-center [&_svg]:mb-2.5 [&_svg]:h-[30px] [&_svg]:w-[30px]"
              : ""
          }`}
        >
          {icon}
          <p>{message}</p>
        </div>
      );
    } else if (isUser) {
      // Display user message exactly as entered, preserving line breaks
      return (
        <div className="group/uw relative">
          <div className="block max-w-full whitespace-pre-wrap rounded-[20px] bg-white p-5 text-[16px] text-ink [&::-webkit-scrollbar]:hidden max-md:box-border max-md:w-full">
            {message}
          </div>
          <div className="pointer-events-none absolute -bottom-[25px] right-0 m-0 -translate-y-1 opacity-0 [transition:opacity_0.12s_ease,transform_0.12s_ease] group-hover/uw:pointer-events-auto group-hover/uw:translate-y-0 group-hover/uw:opacity-100 max-md:pointer-events-auto max-md:translate-y-0 max-md:opacity-100">
            <button
              className={COPY_BTN}
              onClick={(e) => {
                e.stopPropagation();
                copyUser(message);
              }}
              title="Copy user message"
            >
              {copySuccessUser ? (
                <span className="flex items-center gap-[5px]">
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
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      );
    } else {
      return (
        <div className={PROSE}>
          {/* Show "Thinking..." animation when streaming with no content yet */}
          {isStreaming && (!message || message.trim() === "") ? (
            <div className="flex items-center gap-0.5 text-[16px] text-ink opacity-70">
              <span>Thinking</span>
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
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  code({ inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = getPlainText(children).replace(
                      /\n$/,
                      ""
                    );

                    if (!inline && match) {
                      return (
                        <div className="relative my-4 overflow-hidden rounded-md border border-solid border-black/[0.08] bg-black/[0.06] [&_code]:bg-transparent [&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded-b-md [&_pre]:bg-transparent [&_pre]:p-3">
                          <div className="flex items-center justify-between border-0 border-b border-solid border-black/[0.06] bg-transparent px-3 py-2">
                            <span className="text-[12px] font-semibold uppercase text-muted">
                              {match[1]}
                            </span>
                            <button
                              className="flex items-center justify-center rounded border-none bg-none p-[5px] [transition:all_0.2s_ease] hover:bg-white/20"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCopyingCode(match[1]);
                                copyToClipboard(codeString);
                                setTimeout(() => setCopyingCode(null), 2000);
                              }}
                              aria-label="Copy code"
                            >
                              {copyingCode === match[1] ? (
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
                          <pre className={className} {...props}>
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
                  a: ({ ...props }: any) => {
                    return (
                      <a
                        {...props}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="group/lnk inline-flex items-center gap-1 pb-px text-[#2563eb] no-underline [transition:all_0.2s_ease] hover:bg-[rgba(37,99,235,0.05)]"
                      >
                        {props.children}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="opacity-70 [transition:opacity_0.2s_ease] group-hover/lnk:opacity-100"
                        >
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </a>
                    );
                  },
                  p: ({ ...props }: any) => {
                    if (typeof props.children === "string") {
                      const content = props.children;
                      const processedContent = content
                        .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
                        .replace(/@(\w+)/g, '<span class="mention">@$1</span>');

                      return (
                        <p
                          dangerouslySetInnerHTML={{ __html: processedContent }}
                        />
                      );
                    }
                    return <p {...props} />;
                  },
                }}
              >
                {message as string}
              </ReactMarkdown>
              {isStreaming && <div className="hidden"></div>}
            </>
          )}
        </div>
      );
    }
  };

  return (
    <motion.div
      className={`group/msg mb-5 max-w-full ${
        isUser
          ? "w-auto max-w-[70%] self-end max-md:max-w-full max-md:self-stretch"
          : isError
            ? "w-[80%] self-center rounded bg-[#ffebee] p-2.5 text-center text-[#d32f2f]"
            : "self-start max-md:self-stretch"
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
          isUser ? "flex w-full flex-col items-end gap-0 max-md:justify-end" : "flex gap-3"
        }
      >
        {!isTyping && !isError && isUser ? (
          <>
            {/* Render context files ABOVE the message (tagged via context selector) */}
            {contextFiles && contextFiles.length > 0 && (
              <div className="mb-2.5 ml-auto w-full rounded-xl border-[1.5px] border-solid border-[#FFD700] bg-[#FFF9E6] px-[14px] py-2.5">
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#B8860B]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path>
                    <path d="M7 7h.01"></path>
                  </svg>
                  <span>Context:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {contextFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1 rounded-full border-[1.5px] border-solid border-ink bg-white px-2.5 py-1 text-[13px]"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                      <span className="font-medium text-ink">{file.name}</span>
                      <span className="text-[12px] font-normal text-[#666]">
                        ({file.className})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Render attached files ABOVE the message (locally uploaded) */}
            {files && files.length > 0 && (
              <div className="mb-2.5 ml-auto w-full rounded-xl border-[1.5px] border-solid border-[#4A90E2] bg-[#E6F3FF] px-[14px] py-2.5">
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#2E5C8A]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                  </svg>
                  <span>Uploaded:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="inline-block max-w-[200px] overflow-hidden rounded-lg border-[1.5px] border-solid border-ink bg-white"
                    >
                      {file.base64 &&
                      file.type &&
                      file.type.startsWith("image/") ? (
                        <img
                          src={file.base64}
                          alt={file.name}
                          className="block h-auto max-h-[200px] w-full object-cover"
                        />
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 text-[14px]">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                          </svg>
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                            {file.name}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="relative mt-2.5 flex w-full max-w-full justify-end overflow-visible py-3">
              {renderContent()}
            </div>
          </>
        ) : !isTyping && !isError ? (
          <div className="relative mt-2.5 max-w-full py-3">
            {renderContent()}
            {isAI && message && !isStreaming && (
              <div className="pointer-events-none mt-2.5 flex -translate-y-1 justify-start opacity-0 [transition:opacity_0.12s_ease,transform_0.12s_ease] group-hover/msg:pointer-events-auto group-hover/msg:translate-y-0 group-hover/msg:opacity-100 max-md:pointer-events-auto max-md:translate-y-0 max-md:opacity-100">
                <button
                  className={COPY_BTN}
                  onClick={handleCopyFullResponse}
                  title="Copy full response"
                >
                  {copySuccessFull ? (
                    <span className="flex items-center gap-[5px]">
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
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative mt-2.5 max-w-full py-3">{renderContent()}</div>
        )}
      </div>
    </motion.div>
  );
};

export default ChatMessage;
