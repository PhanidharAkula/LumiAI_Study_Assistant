/**
 * Select - the app's custom dropdown, replacing native <select>.
 *
 * Native selects render with OS chrome - on Safari the closed control AND the
 * open option list use system styling that can't be themed to the Luminarium
 * look. This is a fully custom listbox: a styled trigger (caller supplies the
 * box classes, 1:1 with the old select className) plus a portaled, animated
 * option panel. It closes on outside-click, Escape, or scroll. The panel is
 * portaled to <body> and positioned from the trigger's rect, so no ancestor
 * overflow can clip it; it flips above the trigger when low in the viewport.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { spring } from "@shared/motion";
import { useEscapeToClose } from "@shared/hooks/overlay";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Accessible name (toolbar selects have no visible <label>). */
  ariaLabel: string;
  /** Trigger box classes (border/bg/padding/text/width) - swaps 1:1 with the
   *  old native-select className. */
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

// Roughly the tallest the panel grows before it scrolls (max-h-65 + gap).
const PANEL_MAX = 280;

const Select = ({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
  placeholder = "Select…",
  disabled = false,
}: SelectProps) => {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEscapeToClose(open, () => setOpen(false));

  // The panel is pinned to the trigger's rect; once the page scrolls or resizes
  // that rect is stale, so just close rather than chase it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (!open && triggerRef.current) {
      setRect(triggerRef.current.getBoundingClientRect());
    }
    setOpen((v) => !v);
  };

  const selected = options.find((o) => o.value === value);
  const flipUp =
    !!rect &&
    window.innerHeight - rect.bottom < PANEL_MAX &&
    rect.top > window.innerHeight - rect.bottom;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        className={`flex items-center justify-between gap-2 disabled:cursor-wait disabled:opacity-60 ${className}`}
      >
        <span className="truncate">
          {selected ? selected.label : placeholder}
        </span>
        <motion.svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-muted"
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={spring.gentle}
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </button>

      {open &&
        rect &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-900"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.ul
              role="listbox"
              aria-label={ariaLabel}
              style={{
                position: "fixed",
                left: rect.left,
                minWidth: rect.width,
                ...(flipUp
                  ? { bottom: window.innerHeight - rect.top + 6 }
                  : { top: rect.bottom + 6 }),
              }}
              className="z-901 max-h-65 max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg border border-solid border-line bg-vellum p-1 shadow-float"
              initial={{ opacity: 0, y: flipUp ? 6 : -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: spring.plate }}
            >
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-[13px] transition-colors ${
                      active
                        ? "bg-sage/30 font-semibold text-verdi"
                        : "text-ink hover:bg-cream/70"
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {active && (
                      <span
                        className="shrink-0 text-[11px] text-gold"
                        aria-hidden="true"
                      >
                        ✦
                      </span>
                    )}
                  </li>
                );
              })}
            </motion.ul>
          </>,
          document.body
        )}
    </>
  );
};

export default Select;
