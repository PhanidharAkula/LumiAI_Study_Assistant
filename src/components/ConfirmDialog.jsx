import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./ConfirmDialog.css";

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Delete",
  cancelText = "Cancel",
  danger = false,
}) => {
  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.2 },
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.2 },
    },
  };

  const dialogVariants = {
    hidden: {
      opacity: 0,
      y: 20,
      scale: 0.95,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 25,
      },
    },
    exit: {
      opacity: 0,
      y: 20,
      scale: 0.95,
      transition: { duration: 0.2 },
    },
  };

  // Choose the appropriate icon based on the dialog title
  const renderIcon = () => {
    if (title.includes("Sign Out")) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
      );
    } else if (title.includes("File Already Exists")) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <path d="M12 18v-6"></path>
          <path d="M12 9h.01"></path>
        </svg>
      );
    } else {
      // Default delete icon for other cases
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="30"
          height="30"
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
      );
    }
  };

  // Determine the icon color based on dialog type
  const getIconClass = () => {
    if (title.includes("Sign Out")) {
      return "sign-out-icon";
    } else if (title.includes("File Already Exists")) {
      return "file-exists-icon";
    } else {
      return "delete-icon";
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="confirm-dialog-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="confirm-dialog"
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className={`confirm-dialog-icon ${getIconClass()}`}>
              {renderIcon()}
            </div>
            <h2 className="confirm-dialog-title">{title}</h2>
            <p className="confirm-dialog-message">{message}</p>
            <div className="confirm-dialog-actions">
              <motion.button
                className="confirm-dialog-button cancel-button"
                onClick={onClose}
                whileHover={{
                  scale: 1.03,
                  y: -3,
                  transition: { type: "spring", stiffness: 300, damping: 5 },
                }}
                whileTap={{ scale: 0.98 }}
              >
                {cancelText}
              </motion.button>
              <motion.button
                className={`confirm-dialog-button confirm-button ${
                  danger ? "danger" : ""
                }`}
                onClick={onConfirm}
                whileHover={{
                  scale: 1.03,
                  y: -3,
                  transition: { type: "spring", stiffness: 300, damping: 5 },
                }}
                whileTap={{ scale: 0.98 }}
              >
                {confirmText}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;
