import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

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

// Shared dialog button base (the confirm variant only swaps its background).
const BTN_BASE =
  "min-w-[120px] cursor-pointer rounded-full border-[1.5px] border-solid border-ink px-[25px] py-3 text-[16px] font-medium text-ink shadow-[0px_2px_0_#000] max-md:min-w-0 max-md:text-[14px] max-[480px]:min-w-[100px] max-[480px]:px-[18px] max-[480px]:py-2.5 max-[480px]:text-[14px]";

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

  // Per-type icon-wrapper coloring (was the .accdel-*-icon classes).
  const getIconClass = () => {
    if (title && title.includes("Sign Out"))
      return "bg-[#E0E7FF] text-[#4F46E5] border-[1.5px] border-solid border-[#4F46E5]";
    if (
      title &&
      (title.includes("Successfully Deleted") ||
        title.includes("Deleted Successfully"))
    )
      return "bg-[#D1FAE5] text-[#10B981] border-[1.5px] border-solid border-[#10B981]";
    if (title && title.includes("File Already Exists"))
      return "bg-[#FEF3C7] text-[#D97706] border-[1.5px] border-solid border-[#D97706]";
    if (
      title &&
      (title.includes("Unsupported") ||
        title.includes("No Files") ||
        title.includes("Failed"))
    )
      return "bg-[#FEF3C7] text-[#F59E0B] border-[1.5px] border-solid border-[#F59E0B]";
    if (title && title.toLowerCase().includes("coming"))
      return "bg-[#EFF6FF] text-[#1D4ED8] border-[1.5px] border-solid border-[#1D4ED8]";
    return "bg-[#FEE2E2] text-[#EF4444] border-[1.5px] border-solid border-[#EF4444]";
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

  const isSingle = !cancelText || cancelText.trim() === "";

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="accdel-dialog-overlay pointer-events-auto fixed inset-0 isolate z-[999999] flex h-full w-full items-center justify-center bg-black/75"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="flex w-[90%] max-w-[500px] flex-col items-center rounded-xl border-[1.5px] border-solid border-ink bg-white p-[30px] shadow-[0_10px_25px_rgba(0,0,0,0.2)] max-md:w-full max-[480px]:w-[calc(100%-24px)] max-[480px]:max-w-[min(420px,calc(100%-24px))] max-[480px]:p-5"
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`mb-5 flex h-[70px] w-[70px] items-center justify-center rounded-full max-[480px]:h-[50px] max-[480px]:w-[50px] [&_svg]:h-9 [&_svg]:w-9 max-md:[&_svg]:h-[22px] max-md:[&_svg]:w-[22px] ${getIconClass()}`}
            >
              {renderIcon()}
            </div>
            <h2 className="mb-[15px] text-center text-[24px] font-bold text-ink max-md:text-[22px] max-[480px]:mb-2.5 max-[480px]:text-[20px]">
              {getDisplayTitle()}
            </h2>
            <p className="mb-[30px] whitespace-pre-line text-center text-[16px] leading-[1.5] text-muted max-[480px]:mb-[25px] max-[480px]:text-[14px]">
              {message}
            </p>
            <div className="flex w-full justify-center gap-[15px]">
              {cancelText && cancelText.trim() !== "" && (
                <motion.button
                  className={`${BTN_BASE} bg-transparent`}
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
                className={`${BTN_BASE} ${
                  danger
                    ? "bg-[#EF4444] text-white"
                    : isSingle
                      ? "bg-[#10B981] text-white"
                      : "bg-sage"
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
