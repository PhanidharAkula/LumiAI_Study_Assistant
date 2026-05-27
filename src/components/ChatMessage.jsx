import React, { useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "./ChatMessage.css";

const ChatMessage = ({
  message,
  type,
  errorType,
  isStreaming = false,
  files = [],
  contextFiles = [],
}) => {
  const isUser = type === "user";
  const isTyping = type === "typing";
  const isError = type === "error";
  const isAI = type === "assistant";
  const [copySuccessFull, setCopySuccessFull] = useState(false);
  const [copySuccessUser, setCopySuccessUser] = useState(false);
  const [copyingCode, setCopyingCode] = useState(null);

  const copyToClipboard = (text) => {
    return navigator.clipboard.writeText(text).catch((err) => {
      console.error("Could not copy text: ", err);
    });
  };

  // Utility: extract plain text from React nodes / arrays / markdown node structures
  const getPlainText = (node) => {
    if (node == null) return "";
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(getPlainText).join("");
    // React element
    if (React && React.isValidElement && React.isValidElement(node)) {
      return getPlainText(node.props && node.props.children);
    }
    // Generic object from remark/rehype
    if (typeof node === "object") {
      if (typeof node.value === "string") return node.value;
      if (node.children) return getPlainText(node.children);
    }
    return "";
  };

  const copyFull = (text) => {
    const plain = getPlainText(text);
    copyToClipboard(plain).then(() => {
      setCopySuccessFull(true);
      setTimeout(() => setCopySuccessFull(false), 2000);
    });
  };

  const copyUser = (text) => {
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
        <div className="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
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
          className={`error-content ${
            errorType === "quota" ? "quota-error" : ""
          }`}
        >
          {icon}
          <p>{message}</p>
        </div>
      );
    } else if (isUser) {
      // Display user message exactly as entered, preserving line breaks
      return (
        <div className="user-message-text-wrapper">
          <div className="user-message-text">{message}</div>
          <div className="message-actions user-actions">
            <button
              className="copy-message-button"
              onClick={(e) => {
                e.stopPropagation();
                copyUser(message);
              }}
              title="Copy user message"
            >
              {copySuccessUser ? (
                <span className="copy-success">
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
            </button>
          </div>
        </div>
      );
    } else {
      return (
        <div className="markdown-container">
          {/* Show "Thinking..." animation when streaming with no content yet */}
          {isStreaming && (!message || message.trim() === "") ? (
            <div className="thinking-indicator">
              <span>Thinking</span>
              <span className="thinking-dots">
                <span className="dot">.</span>
                <span className="dot">.</span>
                <span className="dot">.</span>
              </span>
            </div>
          ) : (
            <>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = getPlainText(children).replace(
                      /\n$/,
                      ""
                    );

                    if (!inline && match) {
                      return (
                        <div className="code-block-wrapper">
                          <div className="code-block-header">
                            <span className="code-language">{match[1]}</span>
                            <button
                              className="copy-code-button"
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
                  a: ({ node, ...props }) => {
                    return (
                      <a
                        {...props}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="markdown-link"
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
                          className="external-link-icon"
                        >
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </a>
                    );
                  },
                  p: ({ node, ...props }) => {
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
                {message}
              </ReactMarkdown>
              {isStreaming && <div className="cursor-blink"></div>}
            </>
          )}
        </div>
      );
    }
  };

  return (
    <motion.div
      className={`chat-message ${
        isUser ? "user-message" : isError ? "error-message" : "ai-message"
      }`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 20,
      }}
    >
      <div className="message-container">
        {!isTyping && !isError && isUser ? (
          <>
            {/* Render context files ABOVE the message (tagged via context selector) */}
            {contextFiles && contextFiles.length > 0 && (
              <div className="message-context-files-above">
                <div className="context-files-header">
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
                <div className="context-files-list">
                  {contextFiles.map((file, index) => (
                    <div key={index} className="context-file-chip">
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
                      <span className="context-file-name">{file.name}</span>
                      <span className="context-file-class">
                        ({file.className})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Render attached files ABOVE the message (locally uploaded) */}
            {files && files.length > 0 && (
              <div className="message-files-above">
                <div className="uploaded-files-header">
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
                <div className="uploaded-files-list">
                  {files.map((file, index) => (
                    <div key={index} className="message-file-item">
                      {file.base64 &&
                      file.type &&
                      file.type.startsWith("image/") ? (
                        <img
                          src={file.base64}
                          alt={file.name}
                          className="message-file-image"
                        />
                      ) : (
                        <div className="message-file-doc">
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
                          <span>{file.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="message-content user-content">
              {renderContent()}
            </div>
          </>
        ) : !isTyping && !isError ? (
          <div
            className={`message-content ai-content ${
              isTyping ? "typing-content" : ""
            } ${errorType === "quota" ? "quota-error-content" : ""}`}
          >
            {renderContent()}
            {isAI && message && !isStreaming && (
              <div className="message-actions">
                <button
                  className="copy-message-button"
                  onClick={handleCopyFullResponse}
                  title="Copy full response"
                >
                  {copySuccessFull ? (
                    <span className="copy-success">
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
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="message-content">{renderContent()}</div>
        )}
      </div>
    </motion.div>
  );
};

export default ChatMessage;
