/**
 * Modal - the shared overlay plate.
 *
 * One primitive for every dialog-shaped surface (create class, tag picker,
 * pickers, error sheets) so they all enter, exit, scrim, scroll-lock, and
 * dismiss identically:
 *  · portal to <body>, night-tinted blurred scrim, Escape + scrim-click close
 *  · centered chart plate on desktop; optional bottom sheet on phones
 *  · reference-counted scroll lock + Escape stack (safe to nest above
 *    fullscreen takeovers like chat/quiz)
 *  · focus moves into the plate on open and returns on close
 *
 * Fullscreen experiences (chat, quiz, flashcards, talk, file viewer) are NOT
 * modals - they keep their own shells; this is for plates floating above a
 * visible page.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CornerTicks, UI } from "./atlas";
import { CloseButton } from "./controls";
import { modalPop, scrimFade, sheetUp } from "@shared/motion";
import {
  useEscapeToClose,
  useMediaQuery,
  useScrollLock,
} from "@shared/hooks/overlay";

const PLATE_SIZES = {
  sm: "max-w-110",
  md: "max-w-140",
  lg: "max-w-190",
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Plate max-width: sm 440 / md 560 / lg 760. */
  size?: keyof typeof PLATE_SIZES;
  /** Mono overline above the title, e.g. "NEW EXPEDITION". */
  overline?: string;
  /** Fraunces heading. Omit (with overline) for fully custom content. */
  title?: string;
  /** Slide up as a bottom sheet on phones instead of the centered pop. */
  sheetOnMobile?: boolean;
  /** Hide the standard ✕ key (dialogs that must resolve via actions). */
  hideClose?: boolean;
  /** Chart-plate corner ticks (default on). */
  ticks?: boolean;
  /** Extra classes for the plate (padding overrides etc.). */
  className?: string;
}

const Modal = ({
  open,
  onClose,
  children,
  size = "sm",
  overline,
  title,
  sheetOnMobile = false,
  hideClose = false,
  ticks = true,
  className = "",
}: ModalProps) => {
  const isPhone = useMediaQuery("(max-width: 767px)");
  const asSheet = sheetOnMobile && isPhone;
  const plateRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useScrollLock(open);
  useEscapeToClose(open, onClose);

  // Move focus into the plate on open; hand it back on close.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      plateRef.current?.focus();
    } else {
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    }
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 z-999990 flex bg-night/55 backdrop-blur-[3px] ${
            asSheet ? "items-end" : "items-center justify-center px-5 py-6"
          }`}
          variants={scrimFade}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            ref={plateRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title || overline || "Dialog"}
            className={`relative flex max-h-[88dvh] w-full flex-col overflow-y-auto border border-solid border-line bg-vellum px-7 py-7 shadow-float outline-none max-[480px]:px-5 ${
              asSheet
                ? "rounded-t-xl rounded-b-none pb-[max(28px,env(safe-area-inset-bottom))]"
                : `rounded-xl ${PLATE_SIZES[size]}`
            } ${className}`}
            variants={asSheet ? sheetUp : modalPop}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {ticks && <CornerTicks />}
            {(overline || title || !hideClose) && (
              <header className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {overline && <p className={UI.overline}>{overline}</p>}
                  {title && (
                    <h2 className="mt-1.5 font-display text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ink max-[480px]:text-[21px]">
                      {title}
                    </h2>
                  )}
                </div>
                {!hideClose && (
                  <CloseButton onClick={onClose} className="-mr-1.5 -mt-1.5" />
                )}
              </header>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default Modal;
