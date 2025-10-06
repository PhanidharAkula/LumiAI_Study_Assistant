import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import "./ChatInput.css";

// Key for storing draft message in localStorage
const DRAFT_MESSAGE_KEY = "lumiAI_draft_message";

const ChatInput = ({
  onSendMessage,
  loading,
  onShowTagSelector,
  onStopGeneration,
  isGenerating = false,
}) => {
  const [message, setMessage] = useState("");
  const textareaRef = useRef(null);

  // Load saved draft when component mounts
  useEffect(() => {
    const savedMessage = localStorage.getItem(DRAFT_MESSAGE_KEY);
    if (savedMessage) {
      setMessage(savedMessage);
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "24px";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = scrollHeight + "px";
    }
  }, [message]);

  // Save draft message whenever it changes
  useEffect(() => {
    // Only save non-empty messages
    if (message.trim()) {
      localStorage.setItem(DRAFT_MESSAGE_KEY, message);
    } else {
      localStorage.removeItem(DRAFT_MESSAGE_KEY);
    }
  }, [message]);

  const handleChange = (e) => {
    setMessage(e.target.value);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (message.trim() && !loading) {
      onSendMessage(message);
      setMessage("");

      // Clear the saved draft after sending
      localStorage.removeItem(DRAFT_MESSAGE_KEY);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "24px";
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="chat-input-container">
      <form onSubmit={handleSubmit} className="chat-form">
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyPress}
          placeholder="Ask a question..."
          disabled={loading && !isGenerating}
        />

        <button
          type="button"
          className="tag-button-bottom"
          onClick={onShowTagSelector}
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
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path>
            <path d="M7 7h.01"></path>
          </svg>
        </button>

        {isGenerating ? (
          <motion.button
            type="button"
            className="stop-button"
            onClick={onStopGeneration}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
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
              <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
            </svg>
          </motion.button>
        ) : (
          <motion.button
            type="submit"
            className="send-button"
            disabled={!message.trim() || isGenerating}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {loading ? (
              <div className="button-spinner"></div>
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
          </motion.button>
        )}
      </form>
    </div>
  );
};

export default ChatInput;
