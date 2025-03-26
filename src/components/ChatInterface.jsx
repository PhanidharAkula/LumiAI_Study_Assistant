import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { sendMessageToAI } from "../lib/aiService";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github-dark.css";
import "./ChatInterface.css";

const ChatInterface = ({ classId, files = [] }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [showDocumentSelector, setShowDocumentSelector] = useState(false);
  const [conversationHistory, setConversationHistory] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const isComponentMounted = useRef(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [creatingTable, setCreatingTable] = useState(false);

  // Safeguard the classId - essential for storage keys
  const safeClassId = classId || "default";

  // Local storage key for persistence
  const storageKey = `lumi-chat-history-${safeClassId}`;

  // Function to create the conversations table - MODIFIED to not use execute_sql
  const createConversationsTable = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setCreatingTable(true);
    }

    try {
      // Since we can't execute SQL directly (execute_sql function not found),
      // we'll just let the normal table operation fail and guide the user
      console.warn(
        "Direct table creation not supported - will attempt to use the table"
      );
      setTableMissing(false);
    } catch (err) {
      console.error("Error creating conversations table:", err);
      // Fail silently - don't show errors to user
    } finally {
      if (showLoading) {
        setCreatingTable(false);
      }
    }
  }, []); // No dependencies needed here

  // Fetch conversation history when component mounts
  useEffect(() => {
    // Set mounted flag
    isComponentMounted.current = true;

    // Load chat history from local storage
    try {
      const savedMessages = localStorage.getItem(storageKey);
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch (err) {
      console.error("Error loading saved messages:", err);
      // Clear potentially corrupted data
      localStorage.removeItem(storageKey);
    }

    // Fetch conversation history
    fetchConversationHistory();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isComponentMounted.current = false;
    };
  }, [safeClassId, storageKey]);

  // Save messages to local storage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } catch (err) {
        console.error("Error saving messages to localStorage:", err);
      }
    }
  }, [messages, storageKey]);

  // Fetch previous conversations from this class - MODIFIED to remove SQL execution
  const fetchConversationHistory = useCallback(async () => {
    if (!safeClassId) return;

    try {
      // Skip checking if table exists and just try to use it directly
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("class_id", safeClassId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        if (
          error.code === "42P01" ||
          (error.message && error.message.includes("does not exist"))
        ) {
          // Table doesn't exist, mark as missing
          setTableMissing(true);
          console.error(
            "Conversations table does not exist. Please create it in the Supabase dashboard."
          );
          return;
        }
        console.error("Error fetching conversation history:", error);
        return; // Fail silently
      }

      if (isComponentMounted.current && Array.isArray(data)) {
        // Group conversations by date
        const groupedConversations = data.reduce((acc, conv) => {
          if (!conv || !conv.created_at) return acc;

          const date = new Date(conv.created_at).toLocaleDateString();
          if (!acc[date]) acc[date] = [];
          acc[date].push(conv);
          return acc;
        }, {});

        setConversationHistory(groupedConversations);
        setTableMissing(false);
      }
    } catch (err) {
      console.error("Error fetching conversation history:", err);
      // Fail silently - don't show errors to user
    }
  }, [safeClassId]); // Removed createConversationsTable from dependencies

  useEffect(() => {
    // Scroll to bottom when messages change
    if (chatEndRef.current) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages]);

  // Clear chat history function
  const clearChatHistory = useCallback(() => {
    // Clear messages from state
    setMessages([]);

    // Clear from localStorage
    try {
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.error("Error clearing localStorage:", err);
    }
  }, [storageKey]);

  // Restore selected documents from history item if applicable
  const restoreConversation = useCallback((question, answer) => {
    if (!question || !answer) return;

    const timestamp = new Date();

    setMessages([
      {
        id: `history-q-${Date.now()}`,
        content: question,
        sender: "user",
        timestamp,
      },
      {
        id: `history-a-${Date.now() + 1}`,
        content: answer,
        sender: "ai",
        timestamp,
      },
    ]);

    setShowHistory(false);
  }, []);

  const toggleDocumentSelector = useCallback(() => {
    setShowDocumentSelector((prev) => !prev);
  }, []);

  const toggleSelectDocument = useCallback((fileId) => {
    if (!fileId) return;

    setSelectedDocuments((prev) => {
      if (prev.includes(fileId)) {
        return prev.filter((id) => id !== fileId);
      } else {
        return [...prev, fileId];
      }
    });
  }, []);

  const handleSendMessage = useCallback(
    async (e) => {
      e.preventDefault();
      if (!input.trim() || loading) return;

      const userMessage = input.trim();
      setInput("");

      // Focus the input after sending
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);

      // Get selected documents
      const selectedFiles = files
        .filter((file) => selectedDocuments.includes(file?.id))
        .filter(Boolean); // Remove any undefined entries

      // Format the message to include document references if any are selected
      let formattedMessage = userMessage;
      if (selectedFiles.length > 0) {
        const docNames = selectedFiles
          .map((file) => `"${file.name || "Unnamed file"}"`)
          .join(", ");
        formattedMessage = `Regarding documents: ${docNames}\n\n${userMessage}`;
      }

      // Add user message to chat
      const userMessageObj = {
        id: `user-${Date.now()}`,
        content: userMessage,
        sender: "user",
        timestamp: new Date(),
        selectedDocs:
          selectedFiles.length > 0
            ? selectedFiles.map((f) => f.name || "Unnamed file")
            : undefined,
      };

      setMessages((prevMessages) => [...prevMessages, userMessageObj]);
      setLoading(true);
      setError(null);

      try {
        // Prepare context from selected documents
        const relevantFiles =
          selectedFiles.length > 0
            ? selectedFiles.map((file) => ({
                name: file.name || "Unnamed file",
                url: file.url || "",
                id: file.id,
              }))
            : // If no documents selected, use the most recently added files (up to 3)
              (files || []).slice(0, 3).map((file) => ({
                name: file.name || "Unnamed file",
                url: file.url || "",
                id: file.id,
              }));

        // Send message to AI service
        const response = await sendMessageToAI(
          formattedMessage,
          relevantFiles,
          safeClassId
        );

        // Add AI response to chat if component is still mounted
        if (isComponentMounted.current) {
          const aiMessageObj = {
            id: `ai-${Date.now()}`,
            content:
              response?.text ||
              "Sorry, I couldn't generate a response. Please try again.",
            sender: "ai",
            timestamp: new Date(),
            sources: response?.sources || [],
            referencedDocs:
              selectedFiles.length > 0
                ? selectedFiles.map((f) => f.id)
                : undefined,
          };

          setMessages((prevMessages) => {
            const updatedMessages = [...prevMessages, aiMessageObj];

            // Save to localStorage directly to ensure it's saved
            try {
              localStorage.setItem(storageKey, JSON.stringify(updatedMessages));
            } catch (err) {
              console.error("Error saving to localStorage:", err);
            }

            return updatedMessages;
          });

          // Clear selected documents after sending
          setSelectedDocuments([]);
          setShowDocumentSelector(false);

          // Save the conversation to the database
          await saveConversation(
            userMessage,
            response?.text || "No response",
            selectedFiles.map((f) => f.id)
          );

          // Refresh conversation history
          fetchConversationHistory();
        }
      } catch (err) {
        console.error("Error sending message to AI:", err);

        if (isComponentMounted.current) {
          setError("Failed to get a response. Please try again.");
        }
      } finally {
        if (isComponentMounted.current) {
          setLoading(false);
        }
      }
    },
    [
      input,
      loading,
      files,
      selectedDocuments,
      safeClassId,
      storageKey,
      fetchConversationHistory,
    ]
  );

  // Modify the save conversation function to not try to create the table if missing
  const saveConversation = useCallback(
    async (question, answer, documentIds = []) => {
      if (!safeClassId || !question || !answer || tableMissing) return;

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          console.error("Auth error:", userError);
          return;
        }

        const { error } = await supabase.from("conversations").insert({
          class_id: safeClassId,
          user_id: user.id,
          question,
          answer,
          document_ids: documentIds.filter(Boolean),
          created_at: new Date().toISOString(),
        });

        if (error) {
          console.error("Error inserting conversation:", error);

          // If table doesn't exist, mark it as missing
          if (
            error.code === "42P01" ||
            (error.message && error.message.includes("does not exist"))
          ) {
            setTableMissing(true);
          }
        }
      } catch (err) {
        console.error("Error saving conversation:", err);
        // Fail silently
      }
    },
    [safeClassId, tableMissing] // Removed createConversationsTable from dependencies
  );

  // Helper function to truncate text
  function truncate(text, maxLength) {
    if (!text) return "";
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  }

  // Helper function to get file icon based on file type
  function getFileIcon(fileType) {
    if (!fileType)
      return (
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
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
          <polyline points="13 2 13 9 20 9"></polyline>
        </svg>
      );

    if (fileType.startsWith("image/")) {
      return (
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
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      );
    }

    if (fileType === "application/pdf") {
      return (
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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      );
    }

    // Default document icon
    return (
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
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
    );
  }

  // Suggested prompts that would be useful for students
  const suggestedPrompts = [
    "Summarize the main concepts from my uploaded documents",
    "Create detailed study flashcards from my materials",
    "Explain how this concept works in simple terms",
    "Generate a practice quiz based on this content",
    "Compare and contrast the key theories in these documents",
    "Create a comprehensive study outline from my materials",
    "Explain this topic as if I'm a beginner",
    "What are the most important formulas I should memorize?",
  ];

  return (
    <div className="chat-interface">
      <div className="chat-toolbar">
        <button
          className={`chat-toolbar-btn ${showHistory ? "active" : ""}`}
          onClick={() => setShowHistory((prev) => !prev)}
          title="Conversation History"
          type="button"
        >
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
          >
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>History</span>
        </button>

        <button
          className={`chat-toolbar-btn ${
            showDocumentSelector ? "active" : ""
          } ${selectedDocuments.length > 0 ? "has-selected" : ""}`}
          onClick={toggleDocumentSelector}
          title="Tag Documents"
          type="button"
        >
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
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span>
            Documents{" "}
            {selectedDocuments.length > 0
              ? `(${selectedDocuments.length})`
              : ""}
          </span>
        </button>

        {/* Add clear chat button */}
        {messages.length > 0 && (
          <button
            className="chat-toolbar-btn clear-chat-btn"
            onClick={clearChatHistory}
            title="Clear Chat"
            type="button"
          >
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
            >
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Clear</span>
          </button>
        )}
      </div>

      {showHistory && (
        <div className="conversation-history-panel">
          <div className="history-header">
            <h3>Conversation History</h3>
            <button
              className="close-history"
              onClick={() => setShowHistory(false)}
              type="button"
            >
              &times;
            </button>
          </div>

          {Object.keys(conversationHistory).length === 0 ? (
            <div className="history-empty">No previous conversations found</div>
          ) : (
            Object.entries(conversationHistory).map(([date, conversations]) => (
              <div className="history-date-group" key={date}>
                <div className="history-date">{date}</div>
                {Array.isArray(conversations) &&
                  conversations.map((conv) => (
                    <div
                      className="history-item"
                      key={conv.id}
                      onClick={() =>
                        restoreConversation(conv.question, conv.answer)
                      }
                      role="button"
                      tabIndex={0}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          restoreConversation(conv.question, conv.answer);
                        }
                      }}
                    >
                      <div className="history-question">
                        {truncate(conv.question || "", 60)}
                      </div>
                      <div className="history-time">
                        {new Date(conv.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
              </div>
            ))
          )}
        </div>
      )}

      {showDocumentSelector && (
        <div className="document-selector-panel">
          <div className="document-selector-header">
            <h3>Select Documents to Reference</h3>
            <button
              className="close-selector"
              onClick={toggleDocumentSelector}
              type="button"
            >
              &times;
            </button>
          </div>

          {!Array.isArray(files) || files.length === 0 ? (
            <div className="no-documents">
              You haven't uploaded any documents yet
            </div>
          ) : (
            <div className="document-list">
              {files.map(
                (file) =>
                  file && (
                    <div
                      key={file.id}
                      className={`document-item ${
                        selectedDocuments.includes(file.id) ? "selected" : ""
                      }`}
                      onClick={() => toggleSelectDocument(file.id)}
                      role="button"
                      tabIndex={0}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          toggleSelectDocument(file.id);
                        }
                      }}
                    >
                      <div className="document-icon">
                        {getFileIcon(file.type)}
                      </div>
                      <div className="document-name">
                        {file.name || "Unnamed file"}
                      </div>
                      {selectedDocuments.includes(file.id) && (
                        <div className="document-check">
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
                        </div>
                      )}
                    </div>
                  )
              )}
            </div>
          )}

          {selectedDocuments.length > 0 && (
            <div className="selected-documents-summary">
              <span>
                {selectedDocuments.length} document
                {selectedDocuments.length !== 1 ? "s" : ""} selected
              </span>
              <button
                className="clear-selected"
                onClick={() => setSelectedDocuments([])}
                type="button"
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="lumi-avatar">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
              </svg>
            </div>
            <h3>I'm Lumi, your AI study assistant</h3>
            <p>
              Ask me questions about your study materials and I'll help you
              understand them better.
            </p>

            <div className="suggested-prompts">
              <h4>Try asking me:</h4>
              <div className="prompt-cards">
                {suggestedPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    className="prompt-card"
                    onClick={() => setInput(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`message ${
                message.sender === "user" ? "user-message" : "ai-message"
              }`}
            >
              {message.sender === "user" ? (
                <div className="message-avatar user">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
              ) : (
                <div className="message-avatar ai">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 16v-4"></path>
                    <path d="M12 8h.01"></path>
                  </svg>
                </div>
              )}

              <div className="message-bubble">
                {message.selectedDocs && message.selectedDocs.length > 0 && (
                  <div className="referenced-docs">
                    <span>Referenced documents:</span>
                    <div className="doc-tags">
                      {message.selectedDocs.map((docName, idx) => (
                        <span key={idx} className="doc-tag">
                          {docName || "Unnamed document"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="message-content">
                  {message.sender === "ai" ? (
                    <ReactMarkdown
                      className="markdown-content"
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                    >
                      {message.content || ""}
                    </ReactMarkdown>
                  ) : (
                    <div className="message-text">{message.content || ""}</div>
                  )}

                  {message.sources && message.sources.length > 0 && (
                    <div className="message-sources">
                      <h4>Sources:</h4>
                      <ul>
                        {message.sources.map((source, idx) => (
                          <li key={idx}>{source}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="message-footer">
                  <div className="message-timestamp">
                    {message.timestamp
                      ? new Date(message.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </div>

                  {message.sender === "ai" && (
                    <div className="message-actions">
                      <button
                        className="action-btn copy-btn"
                        title="Copy to clipboard"
                        type="button"
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(
                              message.content || ""
                            );
                          } catch (err) {
                            console.error("Failed to copy:", err);
                          }
                        }}
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
                      </button>
                      <button
                        className="action-btn save-btn"
                        title="Save to notes"
                        type="button"
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
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                          <polyline points="17 21 17 13 7 13 7 21"></polyline>
                          <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        {error && <div className="error-message">{error}</div>}
        {loading && (
          <div className="typing-indicator-container">
            <div className="message-avatar ai">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
              </svg>
            </div>
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form className="chat-input-container" onSubmit={handleSendMessage}>
        {selectedDocuments.length > 0 && (
          <div className="selected-docs-chips">
            {selectedDocuments.map((docId) => {
              const doc = files.find((f) => f && f.id === docId);
              return doc ? (
                <div key={docId} className="doc-chip">
                  <span>{doc.name || "Unnamed file"}</span>
                  <button
                    type="button"
                    className="remove-doc"
                    onClick={() => toggleSelectDocument(docId)}
                  >
                    &times;
                  </button>
                </div>
              ) : null;
            })}
          </div>
        )}

        <div className="input-wrapper">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Lumi AI a question..."
            disabled={loading}
            className="chat-input"
            ref={inputRef}
          />

          <button
            className="docs-button"
            type="button"
            onClick={toggleDocumentSelector}
            title="Select documents to reference"
          >
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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </button>

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="send-button"
          >
            {loading ? (
              <span className="sending-spinner"></span>
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
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            )}
          </button>
        </div>
      </form>

      {tableMissing && (
        <div className="missing-table-notice">
          <div className="missing-table-content">
            <h3>Conversation History Not Available</h3>
            <p>
              The conversations table does not exist in your database. Please
              run the following SQL in your Supabase SQL Editor:
            </p>
            <pre className="sql-instructions">
              {`CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  document_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_conversations_class_id ON public.conversations(class_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);`}
            </pre>
            <button
              className="refresh-button"
              onClick={fetchConversationHistory}
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;
