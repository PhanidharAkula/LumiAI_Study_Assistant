/**
 * Shared AI-generation wait state for the study tools (Quiz + Flashcards):
 * the kit Spinner with a mono label ("CHARTING QUESTIONS…" / "COMPOSING
 * CARDS…"), a short muted description, and an optional Cancel.
 *
 * Rendered as a direct child of each screen's AnimatePresence - pass a stable
 * `key` at the call site.
 */
import { motion } from "framer-motion";
import { Button, Spinner } from "@shared/components/controls";

interface GeneratingStateProps {
  /** Mono caption under the ring, e.g. "Charting questions…". */
  label: string;
  /** One quiet sentence about what's being generated. */
  description: string;
  /** Renders a ghost Cancel when provided. */
  onCancel?: () => void;
}

const GeneratingState = ({
  label,
  description,
  onCancel,
}: GeneratingStateProps) => (
  <motion.div
    className="m-auto flex w-full max-w-[560px] flex-col items-center justify-center gap-5 px-5 text-center"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
  >
    <Spinner label={label} />
    <p className="m-0 text-[14px] text-muted">{description}</p>
    {onCancel && (
      <Button variant="ghost" className="mt-4 min-w-[120px]" onClick={onCancel}>
        Cancel
      </Button>
    )}
  </motion.div>
);

export default GeneratingState;
