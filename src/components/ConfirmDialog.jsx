import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
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

  const renderIcon = () => {
    if (title && title.includes("Sign Out")) {
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
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
    } else if (title && title.includes("File Already Exists")) {
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
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M12 18v-6" />
          <path d="M12 9h.01" />
        </svg>
      );
    } else if (title && title.toLowerCase().includes("coming")) {
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
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <circle cx="12" cy="16" r="1" />
        </svg>
      );
    }

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
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    );
  };

  const getIconClass = () => {
    if (title && title.includes("Sign Out")) return "sign-out-icon";
    if (title && title.includes("File Already Exists"))
      return "file-exists-icon";
    if (title && title.toLowerCase().includes("coming")) return "info-icon";
    return "delete-icon";
  };

  const getDisplayTitle = () => {
    if (!title) return title;
    const lower = title.toLowerCase();
    if (lower.includes("coming")) {
      return title
        .replace(/\s*[—-]\s*coming\s*soon\s*$/i, "")
        .replace(/\s*coming\s*soon\s*$/i, "")
        .trim();
    }
    return title;
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isOpen) {
      document.body.classList.add("confirm-dialog-open");
      document.body.style.overflow = "hidden";
    } else {
      document.body.classList.remove("confirm-dialog-open");
      document.body.style.overflow = "";
    }
    return () => {
      document.body.classList.remove("confirm-dialog-open");
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="confirm-dialog-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="confirm-dialog"
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`confirm-dialog-icon ${getIconClass()}`}>
              {renderIcon()}
            </div>
            <h2 className="confirm-dialog-title">{getDisplayTitle()}</h2>
            <p className="confirm-dialog-message">{message}</p>
            <div className="confirm-dialog-actions">
              {!title || !title.toLowerCase().includes("coming") ? (
                <motion.button
                  className="confirm-dialog-button confirm-cancel-button"
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
              ) : null}

              <motion.button
                className={`confirm-dialog-button confirm-confirm-button ${
                  danger ? "danger" : ""
                } ${
                  title && title.toLowerCase().includes("coming")
                    ? "coming-soon"
                    : ""
                }`}
                onClick={onConfirm}
                whileHover={{
                  scale: 1.03,
                  y: -3,
                  transition: { type: "spring", stiffness: 300, damping: 25 },
                }}
                whileTap={{ scale: 0.98 }}
              >
                {confirmText}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    typeof document !== "undefined" ? document.body : null
  );
};

export default ConfirmDialog;
