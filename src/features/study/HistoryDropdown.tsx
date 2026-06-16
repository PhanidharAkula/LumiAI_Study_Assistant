/**
 * Shared session-history dropdown for the study tools (Quiz + Flashcards):
 * one trigger pill (count badge, night-surface variant), one outside-click
 * scrim, one panel with header + scrolling ledger + constellation empty
 * state. Row CONTENT stays feature-owned via `renderItem`; clickable rows
 * (quiz) get the canonical `plateLift`.
 *
 * Escape closes the dropdown via the shared overlay stack, so it pops before
 * the fullscreen study shell underneath it.
 */
import type { ReactNode } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Constellation, UI } from "@shared/components/atlas";
import {
  DUR,
  fadeRiseSoft,
  plateLift,
  pressLift,
  spring,
  stagger,
} from "@shared/motion";
import { useEscapeToClose } from "@shared/hooks/overlay";

/* Trigger pill - collapses to an icon key on phones (badge floats above). */
const TRIGGER_BASE =
  "relative flex cursor-pointer items-center gap-2 rounded-full border border-solid py-2.5 px-4 text-[13px] font-semibold transition-colors duration-200 max-md:h-11 max-md:w-11 max-md:justify-center max-md:p-0";
const TRIGGER_DAY = `${TRIGGER_BASE} border-ink/25 bg-vellum/70 text-ink hover:border-ink hover:bg-vellum`;
const TRIGGER_NIGHT = `${TRIGGER_BASE} border-starlight/30 bg-transparent text-starlight hover:border-starlight/70 hover:bg-starlight/10`;

/* Drop-in panel motion - vocabulary spring/durations, dropdown-shaped. */
const dropIn: Variants = {
  hidden: { opacity: 0, y: -10, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.plate },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.97,
    transition: { duration: DUR.fast },
  },
};

/* Stagger at most this many rows; the rest appear instantly (§7.3). */
const MAX_STAGGERED_ROWS = 12;

interface HistoryDropdownProps<T> {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Night-surface trigger treatment (quiz while taking). */
  night?: boolean;
  /** Panel header title, e.g. "Quiz History". */
  title: string;
  items: T[];
  itemKey: (item: T) => string | number;
  /** Count nouns for the header, e.g. ["quiz", "quizzes"]. */
  nounSingular: string;
  nounPlural: string;
  /** Row container classes (feature-owned layout; keep `group relative`). */
  itemClassName: string;
  /** Makes rows clickable plates (canonical plateLift + pointer handled here). */
  onItemClick?: (item: T) => void;
  renderItem: (item: T) => ReactNode;
  /** Constellation seed + copy for the empty ledger. */
  emptySeed: string;
  emptyTitle: string;
  emptyHint: string;
}

function HistoryDropdown<T>({
  open,
  onToggle,
  onClose,
  night = false,
  title,
  items,
  itemKey,
  nounSingular,
  nounPlural,
  itemClassName,
  onItemClick,
  renderItem,
  emptySeed,
  emptyTitle,
  emptyHint,
}: HistoryDropdownProps<T>) {
  useEscapeToClose(open, onClose);

  return (
    <div className="relative">
      <motion.button
        type="button"
        className={night ? TRIGGER_NIGHT : TRIGGER_DAY}
        onClick={onToggle}
        aria-label="History"
        aria-expanded={open}
        {...pressLift}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="font-semibold max-md:hidden">History</span>
        {items.length > 0 && (
          <span
            className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-medium max-md:absolute max-md:-right-1 max-md:-top-1 ${
              night ? "bg-starlight text-night" : "bg-ink text-cream"
            }`}
          >
            {items.length}
          </span>
        )}
      </motion.button>

      {/* Outside-click scrim */}
      {open && (
        <div
          className="fixed inset-0 z-999 bg-transparent"
          onClick={onClose}
        />
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute top-[calc(100%+10px)] right-0 z-1000 flex max-h-[80dvh] w-105 max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-solid border-line bg-vellum shadow-float max-[1024px]:w-95 max-md:w-[min(90vw,340px)]"
            style={{ transformOrigin: "top right" }}
            onClick={(e) => e.stopPropagation()}
            variants={dropIn}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="flex items-center justify-between border-0 border-b border-solid border-line bg-cream/60 px-5 py-4">
              <h3 className={`m-0 ${UI.overline}`}>{title}</h3>
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
                {items.length} {items.length === 1 ? nounSingular : nounPlural}
              </span>
            </div>

            <motion.div
              className="flex max-h-[calc(80dvh-100px)] flex-col gap-2 overflow-y-auto p-3 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              variants={stagger(0.05, 0.04)}
            >
              {items.length > 0 ? (
                items.map((item, index) => (
                  <motion.div
                    key={itemKey(item)}
                    className={itemClassName}
                    variants={
                      index < MAX_STAGGERED_ROWS ? fadeRiseSoft : undefined
                    }
                    onClick={onItemClick ? () => onItemClick(item) : undefined}
                    {...(onItemClick ? plateLift : {})}
                  >
                    {renderItem(item)}
                  </motion.div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 px-7.5 py-12.5 text-center">
                  <Constellation
                    name={emptySeed}
                    size={72}
                    className="text-ink/35"
                  />
                  <p className={`m-0 ${UI.overlineMuted}`}>{emptyTitle}</p>
                  <span className="font-display text-[15px] text-muted">
                    {emptyHint}
                  </span>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default HistoryDropdown;
