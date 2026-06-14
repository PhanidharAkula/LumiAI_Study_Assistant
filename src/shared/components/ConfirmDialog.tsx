import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { CornerTicks } from "@shared/components/atlas";
import { Button } from "@shared/components/controls";
import { scrimFade, modalPop } from "@shared/motion";
import { useEscapeToClose } from "@shared/hooks/overlay";

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

// Width treatment for paired dialog buttons (atlas UI.btn* supplies the rest).
const BTN_PAIR_W =
  "min-w-[120px] max-md:min-w-[100px] max-[480px]:min-w-0 max-[480px]:flex-1 max-[480px]:px-5";

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
  const renderIcon = () => {
    if (title && title.includes("Sign Out")) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
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
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
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
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
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
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
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
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
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
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    );
  };

  // Per-type medallion tinting - intent → wash / hairline ring / icon ink.
  const getIconClass = () => {
    if (title && title.includes("Sign Out"))
      return "bg-cream border-line text-ink";
    if (
      title &&
      (title.includes("Successfully Deleted") ||
        title.includes("Deleted Successfully"))
    )
      return "bg-sage/30 border-verdi/30 text-verdi";
    if (title && title.includes("File Already Exists"))
      return "bg-gold/15 border-gold-deep/30 text-gold-deep";
    if (
      title &&
      (title.includes("Unsupported") ||
        title.includes("No Files") ||
        title.includes("Failed"))
    )
      return "bg-gold/15 border-gold-deep/30 text-gold-deep";
    if (title && title.toLowerCase().includes("coming"))
      return "bg-cream border-line text-ink";
    return "bg-vermilion-wash border-vermilion/30 text-vermilion";
  };

  const getDisplayTitle = () => {
    if (!title) return title;
    const lower = title.toLowerCase();
    if (lower.includes("coming")) {
      return title
        .replace(/\s*-\s*coming\s*soon\s*$/i, "")
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

  // Escape resolves the dialog the safe way (cancel), stacking correctly
  // above any fullscreen takeover underneath.
  useEscapeToClose(isOpen, onClose);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="accdel-dialog-overlay pointer-events-auto fixed inset-0 isolate z-[999999] flex h-full w-full items-center justify-center bg-night/60 backdrop-blur-[3px]"
          variants={scrimFade}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="relative flex w-[90%] max-w-[440px] flex-col items-center rounded-xl border border-solid border-line bg-vellum px-8 py-9 shadow-float max-md:w-full max-[480px]:w-[calc(100%-24px)] max-[480px]:max-w-[min(420px,calc(100%-24px))] max-[480px]:px-5 max-[480px]:py-7"
            variants={modalPop}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            <CornerTicks />
            <div
              className={`mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-solid max-md:h-[60px] max-md:w-[60px] max-[480px]:h-14 max-[480px]:w-14 ${getIconClass()}`}
            >
              {renderIcon()}
            </div>
            <h2 className="mb-3 text-center font-display text-[22px] font-semibold leading-[1.3] tracking-[-0.01em] text-ink max-md:text-[21px] max-[480px]:mb-2.5 max-[480px]:text-[20px]">
              {getDisplayTitle()}
            </h2>
            <p className="mb-6 whitespace-pre-line text-center text-[14.5px] leading-[1.65] text-muted max-[480px]:mb-5 max-[480px]:text-[13.5px]">
              {message}
            </p>
            <div
              className="mb-6 flex w-full items-center gap-3 max-[480px]:mb-5"
              aria-hidden="true"
            >
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] leading-none text-gold">✦</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="flex w-full items-center justify-center gap-3 max-[480px]:gap-2.5">
              {cancelText && cancelText.trim() !== "" && (
                <Button
                  variant="ghost"
                  className={BTN_PAIR_W}
                  onClick={onClose}
                >
                  {cancelText}
                </Button>
              )}

              <Button
                variant={danger ? "danger" : "primary"}
                className={isSingle ? "min-w-[160px]" : BTN_PAIR_W}
                onClick={onConfirm}
              >
                {confirmText}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ConfirmDialog;
