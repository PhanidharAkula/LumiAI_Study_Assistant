import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import { getFilePublicUrl } from "../utils/storageUtils";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import ContextTags from "./ContextTags";
import TagSelector from "./TagSelector";
import ConfirmDialog from "./ConfirmDialog";
import {
  fetchStreamingResponse,
  generateConversationTitle,
} from "../services/aiService";
import "./ChatComponent.css";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const STORAGE_KEY_PREFIX = "lumiAI_chat_";
// Use an explicit turn separator that is very unlikely to appear in normal text
const TURN_SEP = "\n\n--LUMI_TURN--\n\n";

// Safely split stored conversation text into parts using the sentinel separator.
// If no sentinel is found, treat the entire text as a single part (no splitting).
const splitConversationParts = (text) => {
  if (!text || typeof text !== "string") return [];
  const bySentinel = text.split(TURN_SEP).filter(Boolean);
  if (bySentinel.length > 1) return bySentinel;
  // Return the whole text as a single part if no separator found
  return [text];
};

const ChatComponent = ({
  isOpen,
  onClose,
  initialClassId = null,
  allClasses = [],
  conversationId = null,
}) => {
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef(messages);
  const [loading, setLoading] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [, setClassData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [, setHistoryFetched] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState(
    initialClassId ? [initialClassId] : []
  );
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedLocalFiles, setUploadedLocalFiles] = useState([]);
  const [currentConversationId, setCurrentConversationId] =
    useState(conversationId);
  const [currentSessionId, setCurrentSessionId] = useState(
    `session-${Date.now()}`
  );
  const [editingTitle, setEditingTitle] = useState(null);
  const [titleInput, setTitleInput] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const historyDropdownRef = useRef(null);
  const userScrolledUp = useRef(false);
  const autoScrollEnabled = useRef(true);

  const scrollToBottom = (force = false, smooth = true) => {
    if (messagesEndRef.current && chatContainerRef.current) {
      // Only auto-scroll if user hasn't manually scrolled up, or if forced
      const shouldScroll =
        force || (!userScrolledUp.current && autoScrollEnabled.current);

      if (shouldScroll) {
        // Use smooth scrolling for better UX, but allow instant for force scrolls
        const behavior = smooth && !force ? "smooth" : "auto";

        // Use requestAnimationFrame for smoother scrolling during streaming
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({
            behavior,
            block: "end",
          });
        });
      }
    }
  };

  // Track if user has scrolled up manually - using wheel/touch events for reliability
  useEffect(() => {
    const container = chatContainerRef.current;

    if (!container) {
      return;
    }

    let scrollTimeout = null;

    // Detect user scrolling UP (away from bottom)
    const handleWheel = (e) => {
      // e.deltaY < 0 means scrolling UP
      if (e.deltaY < 0) {
        // Immediately disable auto-scroll when user scrolls up
        autoScrollEnabled.current = false;
        userScrolledUp.current = true;
      } else if (e.deltaY > 0) {
        // User is scrolling down - check if they're near bottom after a short delay
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          const { scrollTop, scrollHeight, clientHeight } = container;
          const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

          if (distanceFromBottom < 50) {
            autoScrollEnabled.current = true;
            userScrolledUp.current = false;
          }
        }, 100);
      }
    };

    // Check scroll position to re-enable auto-scroll when at bottom
    const handleScroll = () => {
      clearTimeout(scrollTimeout);

      scrollTimeout = setTimeout(() => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const isAtBottom = distanceFromBottom < 10;
        const isNearBottom = distanceFromBottom < 50;

        // Re-enable auto-scroll when user scrolls to bottom
        if (isAtBottom || isNearBottom) {
          autoScrollEnabled.current = true;
          userScrolledUp.current = false;
        }
      }, 50); // Small debounce for performance
    };

    // Listen for wheel events (mouse scroll)
    container.addEventListener("wheel", handleWheel, { passive: true });
    // Listen for scroll position changes
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      clearTimeout(scrollTimeout);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    // keep a ref in sync so async handlers can access the latest messages
    messagesRef.current = messages;

    if (messages.length > 0) {
      const storageKey = `${STORAGE_KEY_PREFIX}${initialClassId || "global"}`;
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          messages,
          selectedClasses,
          selectedFiles,
          timestamp: Date.now(),
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedClasses, selectedFiles]);

  useEffect(() => {
    // Smooth auto-scroll during message updates (streaming)
    // Only scroll if user hasn't manually scrolled up
    if (!userScrolledUp.current && autoScrollEnabled.current) {
      scrollToBottom(false, true);
    }
  }, [messages]);

  useEffect(() => {
    console.log(
      "🎯 useEffect triggered - conversationId:",
      conversationId,
      "initialClassId:",
      initialClassId
    );

    if (conversationId) {
      console.log(
        "📞 About to call loadSpecificConversation with ID:",
        conversationId
      );
      loadSpecificConversation(conversationId);
      return;
    }

    if (initialClassId) {
      setSelectedClasses([initialClassId]);

      const storageKey = `${STORAGE_KEY_PREFIX}${initialClassId}`;
      const savedChat = localStorage.getItem(storageKey);

      if (savedChat) {
        try {
          const {
            messages: savedMessages,
            selectedClasses: savedClasses,
            selectedFiles: savedFiles,
            timestamp,
          } = JSON.parse(savedChat);
          if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
            setMessages(savedMessages);
            setSelectedClasses(savedClasses);
            setSelectedFiles(savedFiles);
            setInitialLoading(false);
            return;
          }
        } catch (e) {
          console.error("Error parsing saved chat:", e);
        }
      }

      fetchClassData(initialClassId);
    } else {
      const storageKey = `${STORAGE_KEY_PREFIX}global`;
      const savedChat = localStorage.getItem(storageKey);

      if (savedChat) {
        try {
          const {
            messages: savedMessages,
            selectedClasses: savedClasses,
            selectedFiles: savedFiles,
            timestamp,
          } = JSON.parse(savedChat);
          if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
            setMessages(savedMessages);
            setSelectedClasses(savedClasses);
            setSelectedFiles(savedFiles);
            setInitialLoading(false);
            return;
          }
        } catch (e) {
          console.error("Error parsing saved chat:", e);
        }
      }

      setInitialLoading(false);
      setMessages([]);
      setSelectedClasses([]);
      setSelectedFiles([]);
    }

    fetchChatHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClassId, conversationId]);

  useEffect(() => {
    if (!showHistory) return;

    const handleClickOutside = (event) => {
      if (
        historyDropdownRef.current &&
        !historyDropdownRef.current.contains(event.target) &&
        !event.target.closest(".history-button")
      ) {
        setShowHistory(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showHistory]);

  const fetchClassData = async (classId) => {
    try {
      setInitialLoading(true);

      const { data: classDetails, error: classError } = await supabase
        .from("classes")
        .select("*")
        .eq("id", classId)
        .maybeSingle();

      if (classError) throw classError;
      setClassData(classDetails);

      const { data: docs, error: docsError } = await supabase
        .from("files")
        .select("*")
        .eq("class_id", classId)
        .order("created_at", { ascending: false });

      if (docsError) throw docsError;
      setDocuments(docs || []);

      const { data: conversations, error: convError } = await supabase
        .from("conversations")
        .select("*")
        .eq("class_id", classId)
        .order("created_at", { ascending: true });

      if (convError) throw convError;

      if (conversations && conversations.length > 0) {
        // For each conversation row, split into parts and interleave user/assistant
        const formattedMessages = conversations.flatMap((conv) => {
          const qParts = splitConversationParts(conv.question);
          const aParts = splitConversationParts(conv.answer);
          const arr = [];
          const max = Math.max(qParts.length, aParts.length);
          for (let i = 0; i < max; i++) {
            if (i < qParts.length) {
              arr.push({
                type: "user",
                content: qParts[i],
                id: `q-${conv.id}-${i}`,
              });
            }
            if (i < aParts.length) {
              arr.push({
                type: "assistant",
                content: aParts[i],
                id: `a-${conv.id}-${i}`,
              });
            }
          }
          return arr;
        });

        setMessages(formattedMessages);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setMessages([]);
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchChatHistory = async () => {
    setHistoryLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setHistoryLoading(false);
        return;
      }

      // Get all conversations
      let query = supabase
        .from("conversations")
        .select(
          `
          id,
          class_id,
          question,
          answer,
          created_at,
          updated_at,
          title,
          session_id,
          classes(name)
        `
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (initialClassId) {
        query = query.eq("class_id", initialClassId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Process conversations for display
      const processedHistory = data.map((conv) => {
        // Count questions in this conversation using safe splitter
        const questions = splitConversationParts(conv.question);
        const messageCount = questions.length;

        // Get the first question for display
        const firstQuestion = questions[0] || "";

        return {
          ...conv,
          title: conv.title || `Conversation`,
          displayQuestion: firstQuestion,
          messageCount: messageCount,
          hasMultipleMessages: messageCount > 1,
        };
      });

      setChatHistory(processedHistory);
      setHistoryFetched(true);
    } catch (error) {
      console.error("Error fetching chat history:", error);
      setChatHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadSpecificConversation = async (id) => {
    try {
      setInitialLoading(true);
      console.log("🔄 Loading conversation:", id);

      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        console.log("📥 Conversation data loaded:", {
          id: data.id,
          hasMetadata: !!data.messages_metadata,
          metadataLength: data.messages_metadata?.length || 0,
        });

        // If this conversation has a session_id, fetch all conversations in the same session
        // and combine their turns so the full session history is loaded (enables continuation)
        let sessionConversations = [data];
        if (data.session_id) {
          try {
            const { data: sessionRows, error: sessionError } = await supabase
              .from("conversations")
              .select("*")
              .eq("session_id", data.session_id)
              .eq("user_id", data.user_id)
              .order("created_at", { ascending: true });

            if (!sessionError && sessionRows && sessionRows.length) {
              sessionConversations = sessionRows;
            }
          } catch (e) {
            console.warn("Error fetching session conversations:", e);
          }
        }

        // Combine all rows into a single ordered messages array
        const messageArray = [];
        for (const conv of sessionConversations) {
          const qParts = splitConversationParts(conv.question);
          const aParts = splitConversationParts(conv.answer);
          const maxParts = Math.max(qParts.length, aParts.length);

          // Try to parse stored message metadata if available
          let storedMessages = [];
          try {
            if (conv.messages_metadata) {
              storedMessages = JSON.parse(conv.messages_metadata);
              console.log("📦 Loaded messages metadata:", storedMessages);
            } else {
              console.log("⚠️ No messages_metadata found in conversation");
            }
          } catch (e) {
            console.warn("Could not parse messages_metadata:", e);
          }

          for (let i = 0; i < maxParts; i++) {
            if (i < qParts.length) {
              // Try to find stored metadata for this message
              const storedUserMsg = storedMessages.find(
                (m) => m.type === "user" && m.index === i
              );

              if (storedUserMsg) {
                console.log(
                  `📝 Found metadata for user message ${i}:`,
                  storedUserMsg
                );
              }

              messageArray.push({
                type: "user",
                content: qParts[i],
                id: `q-${conv.id}-${i}`,
                // Restore contextFiles and files if available
                contextFiles: storedUserMsg?.contextFiles || [],
                files: storedUserMsg?.files || [],
              });
            }
            if (i < aParts.length) {
              messageArray.push({
                type: "assistant",
                content: aParts[i],
                id: `a-${conv.id}-${i}`,
              });
            }
          }
        }

        setMessages(messageArray);
        setCurrentConversationId(id);
        setCurrentSessionId(data.session_id || `session-${Date.now()}`);

        if (data.context_classes) {
          setSelectedClasses(data.context_classes);
        }
        if (data.context_files) {
          setSelectedFiles(data.context_files);
        }

        // Scroll to bottom after loading conversation
        setTimeout(() => {
          scrollToBottom(true, false);
        }, 100);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error("Error fetching conversation:", error);
      setMessages([]);
    } finally {
      setInitialLoading(false);
    }
  };

  // Tag selection is handled by `handleTagSelection` defined below (keeps modal control with TagSelector)

  const buildAIContext = async () => {
    // Build a clear, delimited context block. This returns a short string
    // describing which classes and files are active. If nothing is selected,
    // return an empty string so the assistant behaves as a general chat model.
    try {
      if (!selectedClasses.length && !selectedFiles.length) return "";

      const parts = [];
      // List selected classes and how many files are included
      if (selectedClasses.length) {
        parts.push("Selected classes:");
        selectedClasses.forEach((classId) => {
          const cls = allClasses.find((c) => c.id === classId);
          if (!cls) return;
          const totalFiles = cls.files?.length || 0;
          // count how many of this class's files are selected
          const filesSelectedFromClass = (cls.files || []).filter((f) =>
            selectedFiles.includes(f.id)
          );
          const filesSelectedCount = filesSelectedFromClass.length;
          parts.push(
            `- ${cls.name} (id: ${cls.id}): ${filesSelectedCount}/${totalFiles} files selected`
          );
        });
      }

      // List explicitly selected files and attempt to include their text
      if (selectedFiles.length) {
        parts.push("Selected files:");
        // Use for..of so we can await inside the loop when fetching content
        for (const fileId of selectedFiles) {
          let found = false;
          for (const cls of allClasses) {
            const fileObj = cls.files?.find((f) => f.id === fileId);
            if (fileObj) {
              found = true;
              parts.push(
                `- ${fileObj.name} (id: ${fileObj.id}) from ${cls.name}`
              );

              // Attempt to fetch textual content for supported MIME types
              try {
                const mime = (fileObj.type || "").toLowerCase();
                const fileName = (fileObj.name || "").toLowerCase();
                const isText =
                  mime.startsWith("text") ||
                  mime.includes("json") ||
                  mime.includes("xml") ||
                  mime.includes("markdown") ||
                  mime.includes("csv") ||
                  mime.includes("plain");
                const isPDF = mime.includes("pdf") || fileName.endsWith(".pdf");

                if (isText) {
                  const { url, error } = await getFilePublicUrl(
                    "files",
                    fileObj.path
                  );
                  if (url && !error) {
                    try {
                      const resp = await fetch(url);
                      if (resp.ok) {
                        const text = await resp.text();
                        const truncated = text.slice(0, 20000);
                        parts.push("---BEGIN FILE CONTENT---");
                        parts.push(truncated);
                        parts.push("---END FILE CONTENT---");
                        if (text.length > truncated.length)
                          parts.push("[Truncated file content]");
                      } else {
                        parts.push(
                          `[Could not fetch file content: HTTP ${resp.status}]`
                        );
                      }
                    } catch {
                      parts.push("[Error fetching file content]");
                    }
                  } else {
                    parts.push(
                      "[Could not generate URL for file to fetch content]"
                    );
                  }
                } else if (isPDF) {
                  // Try to extract text from PDF client-side (limited pages)
                  console.log(`📄 Extracting PDF: ${fileObj.name}`);
                  console.log(`PDF MIME type: ${fileObj.type || "not set"}`);
                  console.log(`PDF file path: ${fileObj.path}`);
                  try {
                    const { url, error } = await getFilePublicUrl(
                      "files",
                      fileObj.path
                    );
                    console.log(
                      `PDF URL obtained:`,
                      url ? "✅" : "❌",
                      error || ""
                    );
                    if (url && !error) {
                      // fetch binary and pass arrayBuffer to pdfjs
                      const resp = await fetch(url);
                      console.log(`PDF fetch status: ${resp.status}`);
                      if (resp.ok) {
                        const arrayBuffer = await resp.arrayBuffer();
                        console.log(
                          `PDF size: ${arrayBuffer.byteLength} bytes`
                        );
                        const loadingTask = pdfjsLib.getDocument({
                          data: arrayBuffer,
                        });
                        const pdf = await loadingTask.promise;
                        console.log(`PDF loaded: ${pdf.numPages} pages`);
                        let fullText = "";
                        const maxPages = Math.min(pdf.numPages, 20);
                        for (let p = 1; p <= maxPages; p++) {
                          try {
                            const page = await pdf.getPage(p);
                            const content = await page.getTextContent();
                            const strings = content.items
                              .map((it) => it.str)
                              .join(" ");
                            fullText += strings + "\n\n";
                            if (fullText.length > 18000) break;
                          } catch (pageErr) {
                            console.warn("Error extracting page", p, pageErr);
                            break;
                          }
                        }
                        const truncated = fullText.slice(0, 20000);
                        console.log(
                          `✅ PDF extracted: ${truncated.length} characters from ${maxPages} pages`
                        );

                        if (truncated.trim().length > 0) {
                          parts.push("---BEGIN FILE CONTENT (PDF EXTRACT)---");
                          parts.push(truncated);
                          parts.push("---END FILE CONTENT (PDF EXTRACT)---");
                          if (fullText.length > truncated.length)
                            parts.push("[Truncated PDF content]");
                        } else {
                          console.warn(
                            `⚠️ PDF "${fileObj.name}" extracted but contains no text`
                          );
                          parts.push(
                            `[⚠️ PDF "${fileObj.name}" appears to be image-based or contains no extractable text. Consider uploading it via the + button for image analysis.]`
                          );
                        }
                      } else {
                        console.error(
                          `❌ PDF fetch failed: HTTP ${resp.status}`
                        );
                        parts.push(
                          `[Could not fetch PDF: HTTP ${resp.status}]`
                        );
                      }
                    } else {
                      console.error(`❌ Could not get PDF URL:`, error);
                      parts.push(
                        "[Could not generate URL for PDF to extract content]"
                      );
                    }
                  } catch (err) {
                    console.error("PDF extraction error:", err);
                    parts.push(
                      `[⚠️ Unable to extract text from PDF "${fileObj.name}". The file may be image-based or have extraction restrictions. Consider uploading it via the + button for analysis.]`
                    );
                  }
                } else {
                  parts.push(
                    `[${
                      fileObj.type || "file"
                    } not included - content not extracted]`
                  );
                }
              } catch {
                parts.push("[Error while attempting to include file content]");
              }

              break;
            }
          }
          if (!found)
            parts.push(`- file id: ${fileId} (metadata not found locally)`);
        }
      }

      // Include any explicitly selected documents
      if (selectedDocs && selectedDocs.length) {
        parts.push("Selected documents:");
        selectedDocs.forEach((docId) => {
          const doc = documents.find((d) => d.id === docId);
          if (doc) {
            parts.push(`- ${doc.name} (id: ${doc.id})`);
          } else {
            parts.push(`- document id: ${docId}`);
          }
        });
      }

      return parts.join("\n");
    } catch (err) {
      console.error("Error building AI context:", err);
      return "";
    }
  };

  const handleSendMessage = async (message, files = []) => {
    if (!message.trim() && files.length === 0) return;
    try {
      // Build context files metadata for display
      const contextFiles = [];

      // Add tagged files from selected context
      selectedFiles.forEach((fileId) => {
        for (const cls of allClasses) {
          const fileObj = cls.files?.find((f) => f.id === fileId);
          if (fileObj) {
            contextFiles.push({
              id: fileObj.id,
              name: fileObj.name,
              type: fileObj.type,
              source: "context", // tagged via context selector
              className: cls.name,
              classId: cls.id,
            });
            break;
          }
        }
      });

      // Build the full context content for this message (for future reference)
      const messageContext = await buildAIContext();

      const userMessage = {
        type: "user",
        content: message,
        files: files, // Locally uploaded files
        contextFiles: contextFiles, // Tagged files from context selector
        selectedClasses: [...selectedClasses], // Store which classes were selected
        selectedFiles: [...selectedFiles], // Store which files were selected
        contextContent: messageContext, // Store the actual content for history
        id: `user-${Date.now()}`,
      };
      setMessages((prev) => [...prev, userMessage]);

      // Clear all context immediately after sending (hide active context area)
      setUploadedLocalFiles([]);
      setSelectedClasses([]);
      setSelectedFiles([]);

      // Re-enable auto-scroll when user sends a new message
      autoScrollEnabled.current = true;
      userScrolledUp.current = false;
      scrollToBottom(true); // Force scroll when user sends a message

      setLoading(true);

      // Create a new AbortController for this request
      const controller = new AbortController();
      setAbortController(controller);

      const aiMessageId = `ai-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          type: "assistant",
          content: "",
          id: aiMessageId,
          isStreaming: true,
        },
      ]);

      const context = await buildAIContext();

      let fullResponse = "";
      console.log("=== AI Context Debug ===");
      console.log("Selected Classes:", selectedClasses);
      console.log("Selected Files:", selectedFiles);
      console.log("Context length:", context.length, "characters");
      console.log("Context preview:", context.substring(0, 500));
      console.log("========================");

      // Build history array from prior messages so the model receives full context
      const historyPayload = [];
      const priorMessages = Array.isArray(messagesRef.current)
        ? messagesRef.current
        : messages;

      for (const m of priorMessages) {
        if (!m || typeof m.content !== "string") continue;
        const trimmed = m.content.trim();
        if (!trimmed) continue;

        if (m.type === "user") {
          // Build user message with context if it was included originally
          let userContent = trimmed;

          // If this message had context content, include it
          if (m.contextContent && m.contextContent.trim()) {
            userContent = `[📚 Study Materials Context - Files from your classes]\n\n${m.contextContent}\n\n[End of Study Materials Context]\n\n${trimmed}`;
          }

          // If this message had uploaded files with text content, include them
          if (m.files && m.files.length > 0) {
            m.files.forEach((file) => {
              if (file.text) {
                userContent += `\n\n[📎 Uploaded Document: ${file.name}]\n${file.text}\n[End of uploaded document]\n`;
              }
            });
          }

          historyPayload.push({ role: "user", content: userContent });
        }

        if (m.type === "assistant" && !m.isStreaming) {
          historyPayload.push({ role: "assistant", content: trimmed });
        }
      }

      // Limit history to last N messages to avoid exceeding token limits
      const MAX_HISTORY_MESSAGES = 20;
      const trimmedHistory = historyPayload.slice(-MAX_HISTORY_MESSAGES);

      const response = await fetchStreamingResponse(
        message,
        context,
        (token) => {
          fullResponse += token;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, content: fullResponse } : msg
            )
          );
          // Only auto-scroll during streaming if user hasn't scrolled up
          if (!userScrolledUp.current) {
            scrollToBottom();
          }
        },
        controller.signal,
        trimmedHistory,
        files // Pass files to the API
      );

      // Helper to sanitize assistant's top-level prefatory phrases
      const sanitizeAssistantResponse = (text) => {
        if (!text || typeof text !== "string") return "";
        // Remove common lead-in lines like 'ChatGPT said:' or 'Alright, here's...'
        const lines = text.split(/\r?\n/);
        // Drop 1-2 lines if they look like a short meta preface
        let start = 0;
        for (let i = 0; i < Math.min(3, lines.length); i++) {
          const l = lines[i].trim();
          if (!l) {
            start = i + 1;
            continue;
          }
          const metaPreface =
            /^(chatgpt|assistant|ai)\b|^(alright|ok|okay|sure)([,.!]?\s+here'?s?)?/i;
          if (metaPreface.test(l) && l.length < 80) {
            start = i + 1;
            continue;
          }
          break;
        }

        const cleaned = lines.slice(start).join("\n").trim();
        return cleaned;
      };

      // sanitize final ai content
      fullResponse = sanitizeAssistantResponse(fullResponse);

      // Update the streaming message in state to the sanitized content
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId ? { ...msg, content: fullResponse } : msg
        )
      );

      // Clear the controller after the response is complete
      setAbortController(null);

      if (response.error) {
        // Handle error but don't return right away if it's aborted
        if (response.error === "aborted") {
          // We still want to save the aborted response, so don't return
        } else {
          setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
          setMessages((prev) => [
            ...prev,
            {
              type: "error",
              content: response.error,
              id: `error-${Date.now()}`,
              errorType: response.errorType || "general",
            },
          ]);
          return; // Only return for non-abort errors
        }
      }

      // Update UI to show it's no longer streaming even for aborted responses
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId ? { ...msg, isStreaming: false } : msg
        )
      );

      // Always save conversation, even if aborted
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        try {
          // Build ordered arrays of questions and answers using messagesRef
          const currentMessages = Array.isArray(messagesRef.current)
            ? messagesRef.current
            : messages;

          const questionParts = [];
          const answerParts = [];

          for (const msg of currentMessages) {
            if (!msg || typeof msg.content !== "string") continue;
            const trimmed = msg.content.trim();
            if (!trimmed) continue;
            if (msg.type === "user") questionParts.push(trimmed);
            if (msg.type === "assistant" && !msg.isStreaming)
              answerParts.push(trimmed);
          }

          // Ensure current exchange is included
          const lastQuestion = questionParts[questionParts.length - 1];
          if (!lastQuestion || lastQuestion !== message.trim()) {
            questionParts.push(message.trim());
          }
          const lastAnswer = answerParts[answerParts.length - 1];
          if (!lastAnswer || lastAnswer !== fullResponse.trim()) {
            answerParts.push(fullResponse.trim());
          }

          const allUserMessages = questionParts
            .map((s) => s.trim())
            .filter(Boolean)
            .join(TURN_SEP);
          const allAiResponses = answerParts
            .map((s) => s.trim())
            .filter(Boolean)
            .join(TURN_SEP);

          if (currentConversationId) {
            // Update an explicitly-selected conversation

            // Build messages metadata to preserve contextFiles and files
            const messagesMetadata = [];
            const userMessages = priorMessages.filter((m) => m.type === "user");

            console.log(
              "🔍 Prior messages for metadata:",
              priorMessages.length,
              "user messages:",
              userMessages.length
            );
            userMessages.forEach((msg, index) => {
              console.log(`  Message ${index}:`, {
                hasContextFiles: !!(
                  msg.contextFiles && msg.contextFiles.length > 0
                ),
                hasFiles: !!(msg.files && msg.files.length > 0),
                contextFilesCount: msg.contextFiles?.length || 0,
                filesCount: msg.files?.length || 0,
              });

              if (msg.contextFiles || msg.files) {
                messagesMetadata.push({
                  type: "user",
                  index,
                  contextFiles: msg.contextFiles || [],
                  files: msg.files || [],
                });
              }
            });

            console.log(
              "💾 [Explicit Update] Saving messages metadata:",
              messagesMetadata
            );

            const updatedConversation = {
              question: allUserMessages,
              answer: allAiResponses,
              updated_at: new Date().toISOString(),
              context_classes: selectedClasses,
              context_files: selectedFiles,
              messages_metadata: JSON.stringify(messagesMetadata),
            };

            console.debug(
              "Updating conversation id",
              currentConversationId,
              "with:",
              { allUserMessages, allAiResponses }
            );

            const { error: updateError } = await supabase
              .from("conversations")
              .update(updatedConversation)
              .eq("id", currentConversationId);

            if (updateError)
              console.error("Error updating conversation:", updateError);
          } else {
            // No explicit id: try to find an existing conversation for this session
            let existingConvId = null;
            try {
              const { data: found, error: foundErr } = await supabase
                .from("conversations")
                .select("id")
                .eq("session_id", currentSessionId)
                .eq("user_id", user.id)
                .limit(1)
                .maybeSingle();

              if (!foundErr && found && found.id) existingConvId = found.id;
            } catch (e) {
              console.warn(
                "Error looking up existing conversation by session:",
                e
              );
            }

            if (existingConvId) {
              // Build messages metadata
              const messagesMetadata = [];
              const userMessages = priorMessages.filter(
                (m) => m.type === "user"
              );
              userMessages.forEach((msg, index) => {
                if (msg.contextFiles || msg.files) {
                  messagesMetadata.push({
                    type: "user",
                    index,
                    contextFiles: msg.contextFiles || [],
                    files: msg.files || [],
                  });
                }
              });

              console.log(
                "💾 [Session Update] Saving messages metadata:",
                messagesMetadata
              );

              const updatedConversation = {
                question: allUserMessages,
                answer: allAiResponses,
                updated_at: new Date().toISOString(),
                context_classes: selectedClasses,
                context_files: selectedFiles,
                messages_metadata: JSON.stringify(messagesMetadata),
              };

              console.debug(
                "Found existing conversation for session, updating id:",
                existingConvId
              );
              const { error: updateErr } = await supabase
                .from("conversations")
                .update(updatedConversation)
                .eq("id", existingConvId);

              if (updateErr) {
                console.error(
                  "Error updating existing conversation:",
                  updateErr
                );
              } else {
                setCurrentConversationId(existingConvId);
              }
            } else {
              const title = await generateConversationTitle(
                questionParts[0] || message,
                answerParts[0] || fullResponse
              );

              // Build messages metadata
              const messagesMetadata = [];
              const userMessages = priorMessages.filter(
                (m) => m.type === "user"
              );
              userMessages.forEach((msg, index) => {
                if (msg.contextFiles || msg.files) {
                  messagesMetadata.push({
                    type: "user",
                    index,
                    contextFiles: msg.contextFiles || [],
                    files: msg.files || [],
                  });
                }
              });

              console.log(
                "💾 [New Conversation] Saving messages metadata:",
                messagesMetadata
              );

              const newConversation = {
                class_id: initialClassId || null,
                user_id: user.id,
                question: allUserMessages,
                answer: allAiResponses,
                document_ids: selectedDocs,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                context_classes: selectedClasses,
                context_files: selectedFiles,
                session_id: currentSessionId,
                title: title || "New Conversation",
                messages_metadata: JSON.stringify(messagesMetadata),
              };

              console.debug(
                "Inserting new conversation: questionParts:",
                questionParts,
                "answerParts:",
                answerParts
              );
              console.debug("Saving new conversation strings:", {
                allUserMessages,
                allAiResponses,
              });

              const { data, error } = await supabase
                .from("conversations")
                .insert(newConversation)
                .select();
              if (error) {
                console.error("Error saving conversation:", error);
              } else {
                setCurrentConversationId(data[0].id);
              }
            }
          }

          // Refresh chat history to show updated conversation
          setHistoryFetched(false);
          fetchChatHistory();
        } catch (error) {
          console.error("Error handling conversation:", error);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Don't show an error message if the request was aborted
      if (error.name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            type: "error",
            content:
              "Sorry, there was an error processing your request. Please try again.",
            id: `error-${Date.now()}`,
          },
        ]);
      }
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  };

  // Function to stop the AI response generation
  const handleStopGeneration = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      // Update the streaming message to not show streaming anymore
      setMessages((prev) =>
        prev.map((msg) =>
          msg.isStreaming ? { ...msg, isStreaming: false } : msg
        )
      );
    }
  };

  const handleTagSelection = ({
    selectedClasses: newClasses,
    selectedFiles: newFiles,
  }) => {
    setSelectedClasses(newClasses);
    setSelectedFiles(newFiles);
  };

  const handleRemoveTag = (type, id) => {
    if (type === "class") {
      setSelectedClasses((prev) => prev.filter((classId) => classId !== id));
      const classFiles =
        allClasses.find((c) => c.id === id)?.files.map((f) => f.id) || [];
      setSelectedFiles((prev) =>
        prev.filter((fileId) => !classFiles.includes(fileId))
      );
    } else {
      setSelectedFiles((prev) => prev.filter((fileId) => fileId !== id));
    }
  };

  const handleClearAll = () => {
    setSelectedClasses([]);
    setSelectedFiles([]);
    setUploadedLocalFiles([]);
  };

  const toggleDocumentSelection = (docId) => {
    setSelectedDocs((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    );
  };

  const toggleHistory = () => {
    if (!showHistory) {
      fetchChatHistory();
    }
    setShowHistory(!showHistory);
  };

  const loadConversation = async (conversationPair) => {
    console.log(
      "🔄 [loadConversation] Loading conversation from history:",
      conversationPair.id
    );

    setShowHistory(false);
    setCurrentConversationId(conversationPair.id);
    setCurrentSessionId(conversationPair.session_id || `session-${Date.now()}`);

    // If this conversation belongs to a session, fetch entire session to enable continuation
    let sessionConversations = [conversationPair];
    if (conversationPair.session_id) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data: sessionRows, error: sessionError } = await supabase
          .from("conversations")
          .select("*")
          .eq("session_id", conversationPair.session_id)
          .eq("user_id", user?.id)
          .order("created_at", { ascending: true });

        if (!sessionError && sessionRows && sessionRows.length) {
          sessionConversations = sessionRows;
        }
      } catch (e) {
        // fallback to single conversationPair
        console.warn("Error loading session conversations:", e);
      }
    }

    const messageArray = [];
    for (const conv of sessionConversations) {
      const questionParts = splitConversationParts(conv.question);
      const answerParts = splitConversationParts(conv.answer);

      console.log("🔍 [loadConversation] Split results:", {
        questionPartsCount: questionParts.length,
        answerPartsCount: answerParts.length,
        hasMultipleAnswerParts: answerParts.length > 1,
        answerContainsTurnSep: conv.answer?.includes(TURN_SEP),
        answerContainsDoubleNewline: conv.answer?.includes("\n\n"),
      });

      const maxParts = Math.max(questionParts.length, answerParts.length);

      // Try to parse stored message metadata if available
      let storedMessages = [];
      try {
        if (conv.messages_metadata) {
          storedMessages = JSON.parse(conv.messages_metadata);
          console.log(
            "📦 [loadConversation] Loaded messages metadata:",
            storedMessages
          );
        } else {
          console.log(
            "⚠️ [loadConversation] No messages_metadata found in conversation"
          );
        }
      } catch (e) {
        console.warn("Could not parse messages_metadata:", e);
      }

      for (let i = 0; i < maxParts; i++) {
        if (i < questionParts.length) {
          // Try to find stored metadata for this message
          const storedUserMsg = storedMessages.find(
            (m) => m.type === "user" && m.index === i
          );

          if (storedUserMsg) {
            console.log(
              `📝 [loadConversation] Found metadata for user message ${i}:`,
              storedUserMsg
            );
          }

          messageArray.push({
            type: "user",
            content: questionParts[i],
            id: `hist-q-${conv.id}-${i}`,
            // Restore contextFiles and files if available
            contextFiles: storedUserMsg?.contextFiles || [],
            files: storedUserMsg?.files || [],
          });
        }

        if (i < answerParts.length) {
          messageArray.push({
            type: "assistant",
            content: answerParts[i],
            id: `hist-a-${conv.id}-${i}`,
          });
        }
      }
    }

    setMessages(messageArray);

    if (conversationPair.context_classes) {
      setSelectedClasses(conversationPair.context_classes);
    }
    if (conversationPair.context_files) {
      setSelectedFiles(conversationPair.context_files);
    }

    // Scroll to bottom after loading conversation
    setTimeout(() => {
      scrollToBottom(true, false);
    }, 100);
  };

  const handleClose = () => {
    // Abort any in-flight stream so closing mid-response doesn't keep the
    // request running (wasted work + setState-after-unmount).
    if (abortController) abortController.abort();
    onClose();
  };

  const handleNewConversation = () => {
    // Clear localStorage for this conversation
    const storageKey = `${STORAGE_KEY_PREFIX}${initialClassId || "global"}`;
    localStorage.removeItem(storageKey);

    // Reset the chat state
    setMessages([]);
    setCurrentConversationId(null);
    setCurrentSessionId(`session-${Date.now()}`);
    setSelectedDocs([]);

    // Reset the class and file selections based on context
    if (!initialClassId) {
      setSelectedClasses([]);
      setSelectedFiles([]);
    } else {
      setSelectedClasses([initialClassId]);
      setSelectedFiles([]);
    }

    // Update URL if needed
    if (window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete("conversationId");
      window.history.replaceState({}, "", url.toString());
    }

    // Close the history panel if it's open
    if (showHistory) {
      setShowHistory(false);
    }

    // Refresh the chat history
    setHistoryFetched(false);
    fetchChatHistory();

    // Scroll to bottom
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleTitleEdit = (conv) => {
    setEditingTitle(conv.id);
    setTitleInput(conv.title || "");
  };

  const handleTitleSave = async () => {
    if (!editingTitle || !titleInput.trim()) {
      setEditingTitle(null);
      return;
    }
    try {
      const { error } = await supabase
        .from("conversations")
        .update({ title: titleInput.trim() })
        .eq("id", editingTitle);

      if (error && error.code === "42703") {
        console.warn(
          "Title column does not exist yet. Update your database schema."
        );
      } else if (error) {
        throw error;
      }

      const newChatHistory = chatHistory.map((conv) =>
        conv.id === editingTitle ? { ...conv, title: titleInput.trim() } : conv
      );
      setChatHistory(newChatHistory);
    } catch (error) {
      console.error("Error updating conversation title:", error);
    }
    setEditingTitle(null);
  };

  const handleDeleteConfirm = (conv) => {
    setDeleteConfirm(conv);
  };

  const deleteConversation = async () => {
    if (!deleteConfirm) return;
    try {
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", deleteConfirm.id);

      if (error) throw error;

      const newChatHistory = chatHistory.filter(
        (conv) => conv.id !== deleteConfirm.id
      );

      setChatHistory(newChatHistory);

      if (currentConversationId === deleteConfirm.id) {
        handleNewConversation();
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }

    setDeleteConfirm(null);
  };

  if (!isOpen) return null;

  if (initialLoading) {
    return (
      <motion.div
        className="chat-component"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
      >
        <div className="chat-loading">
          <div className="spinner"></div>
          <p>Loading chat...</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="chat-component"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      tabIndex={-1}
    >
      <motion.div
        className="chat-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="header-actions">
          <div className="history-dropdown-container">
            <button
              className={`history-button ${showHistory ? "active" : ""}`}
              onClick={toggleHistory}
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
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </button>
            <AnimatePresence>
              {showHistory && (
                <motion.div
                  className="history-dropdown"
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                  }}
                  ref={historyDropdownRef}
                >
                  <div className="history-dropdown-header">
                    <h3>Chat History</h3>
                  </div>
                  <div className="history-dropdown-content">
                    {historyLoading ? (
                      <div className="history-loading">
                        <div className="spinner"></div>
                        <p>Loading history...</p>
                      </div>
                    ) : chatHistory.length === 0 ? (
                      <div className="empty-history">
                        <div className="empty-history-icon">
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
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                          </svg>
                        </div>
                        <p>No conversation history yet</p>
                      </div>
                    ) : (
                      chatHistory.map((conv) => (
                        <div key={conv.id} className="history-item">
                          {editingTitle === conv.id ? (
                            <div className="history-item-edit">
                              <input
                                type="text"
                                value={titleInput}
                                onChange={(e) => setTitleInput(e.target.value)}
                                autoFocus
                                onBlur={handleTitleSave}
                                onKeyDown={(e) =>
                                  e.key === "Enter" && handleTitleSave()
                                }
                                className="history-title-input"
                              />
                            </div>
                          ) : (
                            <>
                              <div
                                className="history-item-content"
                                onClick={() => loadConversation(conv)}
                              >
                                <p className="history-title">
                                  {conv.title || "New Conversation"}
                                </p>
                                <p className="history-question">
                                  {conv.displayQuestion}
                                </p>
                              </div>
                              <div className="history-item-actions">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTitleEdit(conv);
                                  }}
                                  className="history-action-button"
                                  title="Edit title"
                                >
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
                                  >
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteConfirm(conv);
                                  }}
                                  className="history-action-button delete"
                                  title="Delete conversation"
                                >
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
                                  >
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              </div>
                              <div className="history-meta">
                                <span className="history-time">
                                  {new Date(
                                    conv.updated_at || conv.created_at
                                  ).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                {conv.classes && (
                                  <span className="history-class">
                                    {conv.classes.name}
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {messages.length > 0 && (
            <button
              className="new-conversation-button"
              onClick={handleNewConversation}
              title="New conversation"
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
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                <line x1="12" y1="7" x2="12" y2="13"></line>
                <line x1="9" y1="10" x2="15" y2="10"></line>
              </svg>
            </button>
          )}
        </div>

        <div className="chat-title"></div>

        <motion.button
          className="back-button"
          onClick={handleClose}
          whileHover={{
            scale: 1.05,
            transition: {
              type: "spring",
              stiffness: 300,
              damping: 5,
            },
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {showTagSelector && (
          <TagSelector
            isOpen={showTagSelector}
            onClose={() => setShowTagSelector(false)}
            classes={allClasses}
            onSelectTags={handleTagSelection}
            initialSelectedClasses={selectedClasses}
            initialSelectedFiles={selectedFiles}
          />
        )}
      </AnimatePresence>

      <div className="chat-main-container">
        <motion.div
          className="chat-content-area"
          animate={{
            width: "100%",
            marginRight: "0",
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
          }}
        >
          {documents.length > 0 && (
            <motion.div
              className="document-selector"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              <div className="document-selector-header">
                <p className="document-selector-title">
                  Select documents for context
                </p>
                <span className="document-count">
                  {selectedDocs.length} selected
                </span>
              </div>

              <div className="document-list">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={`document-item ${
                      selectedDocs.includes(doc.id) ? "selected" : ""
                    }`}
                    onClick={() => toggleDocumentSelection(doc.id)}
                  >
                    <div className="document-icon">
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
                    </div>
                    {doc.name}
                    {selectedDocs.includes(doc.id) && (
                      <div className="document-check">
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
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          <motion.div
            className="chat-messages"
            ref={chatContainerRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            {messages.length === 0 ? (
              <div className="empty-chat">
                <div className="empty-chat-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                <h3>Start a conversation</h3>
                <p>Ask your AI study assistant anything</p>
              </div>
            ) : (
              messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg.content}
                  type={msg.type}
                  errorType={msg.errorType}
                  isStreaming={!!msg.isStreaming}
                  files={msg.files || []}
                  contextFiles={msg.contextFiles || []}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </motion.div>
          <div className="chat-bottom-container">
            <AnimatePresence>
              {(selectedClasses.length > 0 ||
                selectedFiles.length > 0 ||
                uploadedLocalFiles.length > 0) && (
                <motion.div
                  className="chat-context-tags-wrapper"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                >
                  <ContextTags
                    selectedClasses={selectedClasses}
                    selectedFiles={selectedFiles}
                    allClasses={allClasses}
                    onRemoveTag={handleRemoveTag}
                    onShowTagSelector={() => setShowTagSelector(true)}
                    uploadedFiles={uploadedLocalFiles}
                    onRemoveUploadedFile={(index) => {
                      setUploadedLocalFiles((prev) =>
                        prev.filter((_, i) => i !== index)
                      );
                    }}
                    onClearAll={handleClearAll}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <ChatInput
              onSendMessage={handleSendMessage}
              loading={loading}
              onShowTagSelector={() => setShowTagSelector(true)}
              onStopGeneration={handleStopGeneration}
              isGenerating={!!abortController}
              onUploadFiles={(files) => {
                // Add uploaded files to the unified context display
                setUploadedLocalFiles((prev) => [...prev, ...files]);
              }}
            />
          </div>
        </motion.div>
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={deleteConversation}
        title="Delete Conversation"
        message="Are you sure you want to delete this conversation? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger={true}
      />
    </motion.div>
  );
};

export default ChatComponent;
