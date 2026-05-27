import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  hideBackground?: boolean;
}

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Delete",
  cancelText = "Cancel",
  danger = false,
  hideBackground = false,
}: ConfirmDialogProps) => {
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
    } else if (
      title &&
      (title.includes("Successfully Deleted") ||
        title.includes("Deleted Successfully"))
    ) {
      // Success checkmark icon for account deletion confirmation
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
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
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
    } else if (
      title &&
      (title.includes("Unsupported") ||
        title.includes("No Files") ||
        title.includes("Failed"))
    ) {
      // Alert/Warning icon for error states
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
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
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
    if (title && title.includes("Sign Out")) return "accdel-signout-icon";
    if (
      title &&
      (title.includes("Successfully Deleted") ||
        title.includes("Deleted Successfully"))
    )
      return "accdel-success-icon";
    if (title && title.includes("File Already Exists"))
      return "accdel-fileexists-icon";
    if (
      title &&
      (title.includes("Unsupported") ||
        title.includes("No Files") ||
        title.includes("Failed"))
    )
      return "accdel-warning-icon";
    if (title && title.toLowerCase().includes("coming"))
      return "accdel-info-icon";
    return "accdel-delete-icon";
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
      document.body.classList.add("accdel-dialog-open");
      if (hideBackground) {
        document.body.classList.add("accdel-hide-bg");
      }
      document.body.style.overflow = "hidden";
    } else {
      document.body.classList.remove("accdel-dialog-open");
      document.body.classList.remove("accdel-hide-bg");
      document.body.style.overflow = "";
    }
    return () => {
      document.body.classList.remove("accdel-dialog-open");
      document.body.classList.remove("accdel-hide-bg");
      document.body.style.overflow = "";
    };
  }, [isOpen, hideBackground]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="accdel-dialog-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="accdel-main-dialog"
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`accdel-icon-wrapper ${getIconClass()}`}>
              {renderIcon()}
            </div>
            <h2 className="accdel-dialog-title">{getDisplayTitle()}</h2>
            <p className="accdel-dialog-message">{message}</p>
            <div className="accdel-dialog-actions">
              {cancelText && cancelText.trim() !== "" && (
                <motion.button
                  className="accdel-dialog-btn accdel-cancel-btn"
                  onClick={onClose}
                  whileHover={{
                    scale: 1.03,
                    y: -3,
                    transition: { type: "spring", stiffness: 300, damping: 25 },
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  {cancelText}
                </motion.button>
              )}

              <motion.button
                className={`accdel-dialog-btn accdel-confirm-btn ${
                  danger ? "accdel-danger" : ""
                } ${
                  !cancelText || cancelText.trim() === ""
                    ? "accdel-single-btn"
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
    document.body
  );
};

export default ConfirmDialog;
