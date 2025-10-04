import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import ContextTags from "./ContextTags";
import TagSelector from "./TagSelector";
import ConfirmDialog from "./ConfirmDialog";
import {
  fetchAIResponse,
  fetchStreamingResponse,
  generateConversationTitle,
} from "../services/openaiService";
import "./ChatComponent.css";

const STORAGE_KEY_PREFIX = "lumiAI_chat_";

const ChatComponent = ({
  isOpen,
  onClose,
  initialClassId = null,
  allClasses = [],
  conversationId = null,
}) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [classData, setClassData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFetched, setHistoryFetched] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState(
    initialClassId ? [initialClassId] : []
  );
  const [selectedFiles, setSelectedFiles] = useState([]);
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

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
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
  }, [messages, selectedClasses, selectedFiles]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (conversationId) {
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
        .single();

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
        const formattedMessages = conversations.flatMap((conv) => [
          { type: "user", content: conv.question, id: `q-${conv.id}` },
          { type: "assistant", content: conv.answer, id: `a-${conv.id}` },
        ]);
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
        // Count questions in this conversation (each separated by \n\n)
        const questions = conv.question.split("\n\n").filter(Boolean);
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

      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      if (data) {
        // Parse the messages from the stored conversation
        const questionParts = data.question.split("\n\n").filter(Boolean);
        const answerParts = data.answer.split("\n\n").filter(Boolean);

        // Create a properly interleaved conversation
        const messageArray = [];
        const maxParts = Math.max(questionParts.length, answerParts.length);

        for (let i = 0; i < maxParts; i++) {
          if (i < questionParts.length) {
            messageArray.push({
              type: "user",
              content: questionParts[i],
              id: `q-${data.id}-${i}`,
            });
          }

          if (i < answerParts.length) {
            messageArray.push({
              type: "assistant",
              content: answerParts[i],
              id: `a-${data.id}-${i}`,
            });
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

  const buildAIContext = async () => {
    let context = "";

    if (selectedClasses.length === 0 && selectedFiles.length === 0) {
      const totalClasses = allClasses.length;
      const totalFiles = allClasses.reduce(
        (count, c) => count + (c.files?.length || 0),
        0
      );
      context = `Using all your study materials as general context. You have access to ${totalClasses} classes with a total of ${totalFiles} files.`;
      return context;
    }

    if (selectedClasses.length > 0) {
      const classDetails = selectedClasses
        .map((classId) => {
          const classObj = allClasses.find((c) => c.id === classId);
          if (!classObj) return null;
          const fileCount = classObj.files?.length || 0;
          const fileNames =
            classObj.files?.map((f) => f.name).join(", ") || "no files";
          return `- ${classObj.name} class: Contains ${fileCount} files${
            fileCount > 0 ? ` (${fileNames})` : ""
          }`;
        })
        .filter(Boolean);
      context = `Using materials from the following classes:\n${classDetails.join(
        "\n"
      )}`;
    }

    if (selectedFiles.length > 0) {
      const fileDetails = selectedFiles
        .map((fileId) => {
          for (const classObj of allClasses) {
            const file = classObj.files?.find((f) => f.id === fileId);
            if (file) {
              return `- ${file.name} (from ${classObj.name} class)`;
            }
          }
          return null;
        })
        .filter(Boolean);
      context += `\n\nSpecifically using these files:\n${fileDetails.join(
        "\n"
      )}`;
    }

    return context;
  };

  const handleSendMessage = async (message) => {
    if (!message.trim()) return;
    try {
      const userMessage = {
        type: "user",
        content: message,
        id: `user-${Date.now()}`,
      };
      setMessages((prev) => [...prev, userMessage]);
      scrollToBottom();
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
          scrollToBottom();
        },
        controller.signal
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
          // Extract all user messages and AI responses
          const userMessages = messages
            .filter((msg) => msg.type === "user")
            .map((msg) => msg.content);

          const aiResponses = messages
            .filter((msg) => msg.type === "assistant" && !msg.isStreaming)
            .map((msg) => msg.content);

          // Add the current message and response
          userMessages.push(message);
          aiResponses.push(fullResponse);

          // Combine all messages with newlines for storage
          const allUserMessages = userMessages.join("\n\n");
          const allAiResponses = aiResponses.join("\n\n");

          // If this is the first message in a new conversation
          if (!currentConversationId) {
            // Generate title for new conversation
            const title = await generateConversationTitle(
              message,
              fullResponse
            );

            // Create a new conversation record
            const newConversation = {
              class_id: initialClassId || null,
              user_id: user.id,
              question: message, // Start with just the first message
              answer: fullResponse, // Start with just the first response
              document_ids: selectedDocs,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              context_classes: selectedClasses,
              context_files: selectedFiles,
              session_id: currentSessionId,
              title: title || "New Conversation",
            };

            const { data, error } = await supabase
              .from("conversations")
              .insert(newConversation)
              .select();

            if (error) {
              console.error("Error saving conversation:", error);
            } else {
              // Save the conversation ID for future updates
              setCurrentConversationId(data[0].id);
            }
          } else {
            // We're continuing an existing conversation
            const { data: existingConversation, error: fetchError } =
              await supabase
                .from("conversations")
                .select("*")
                .eq("id", currentConversationId)
                .single();

            if (fetchError) {
              console.error(
                "Error fetching existing conversation:",
                fetchError
              );
              return;
            }

            // Update the existing conversation with all messages
            const updatedConversation = {
              question: allUserMessages,
              answer: allAiResponses,
              updated_at: new Date().toISOString(),
            };

            const { error: updateError } = await supabase
              .from("conversations")
              .update(updatedConversation)
              .eq("id", currentConversationId);

            if (updateError) {
              console.error("Error updating conversation:", updateError);
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
    setShowHistory(false);
    setCurrentConversationId(conversationPair.id);
    setCurrentSessionId(conversationPair.session_id || `session-${Date.now()}`);

    // Parse the messages from the stored conversation
    const questionParts = conversationPair.question
      .split("\n\n")
      .filter(Boolean);
    const answerParts = conversationPair.answer.split("\n\n").filter(Boolean);

    // Create a properly interleaved conversation
    const messageArray = [];
    const maxParts = Math.max(questionParts.length, answerParts.length);

    for (let i = 0; i < maxParts; i++) {
      if (i < questionParts.length) {
        messageArray.push({
          type: "user",
          content: questionParts[i],
          id: `hist-q-${conversationPair.id}-${i}`,
        });
      }

      if (i < answerParts.length) {
        messageArray.push({
          type: "assistant",
          content: answerParts[i],
          id: `hist-a-${conversationPair.id}-${i}`,
        });
      }
    }

    setMessages(messageArray);

    if (conversationPair.context_classes) {
      setSelectedClasses(conversationPair.context_classes);
    }
    if (conversationPair.context_files) {
      setSelectedFiles(conversationPair.context_files);
    }
  };

  const handleClose = () => {
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
      ref={chatContainerRef}
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
                                  {/* {conv.hasMultipleMessages && (
                                    <span className="message-count">
                                      {conv.messageCount} messages
                                    </span>
                                  )} */}
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
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
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
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </motion.div>
          <div className="chat-bottom-container">
            <AnimatePresence>
              {(selectedClasses.length > 0 || selectedFiles.length > 0) && (
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
