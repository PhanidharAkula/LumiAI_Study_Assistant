/**
 * Shared "Sources" config card for the study tools (Quiz + Flashcards):
 * plate header with a live selected-count, Select All / Clear instrument
 * keys, and the hairline-checkbox file grid with its constellation empty
 * state. Grid placement comes from the caller via `className`.
 */
import { motion } from "framer-motion";
import { Constellation, UI } from "@shared/components/atlas";
import { fadeRise, keyPress } from "@shared/motion";
import type { StudyFile } from "./extractFileContent";

const fileRow = (checked: boolean) =>
  `flex items-center gap-3 rounded-lg border border-solid px-3.5 py-3 cursor-pointer transition-colors duration-200 ${
    checked
      ? "border-verdi/50 bg-sage/25"
      : "border-ink/20 bg-transparent hover:border-ink/50"
  }`;

const fileCheckbox = (checked: boolean) =>
  `flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-sm border border-solid transition-colors duration-200 ${
    checked
      ? "border-ink bg-ink text-cream"
      : "border-ink/35 bg-transparent text-transparent"
  }`;

const FILE_TOOL_BTN =
  "cursor-pointer rounded-full border border-solid border-ink/25 bg-transparent px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink transition-colors duration-200 hover:border-ink hover:bg-cream/70 disabled:opacity-50 disabled:cursor-not-allowed";

interface FileSelectionCardProps {
  /** Files to offer (callers pre-filter if they only support some types). */
  files: StudyFile[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  /** Disables every control while generation is running. */
  disabled?: boolean;
  emptyTitle: string;
  emptyHint: string;
  /** Grid placement / extra layout classes from the caller. */
  className?: string;
}

/** The file-picker plate. A `fadeRise` child - place under a `stagger()` parent. */
const FileSelectionCard = ({
  files,
  selectedIds,
  onSelectionChange,
  disabled = false,
  emptyTitle,
  emptyHint,
  className = "",
}: FileSelectionCardProps) => (
  <motion.div
    className={`${UI.plate} h-full p-5 flex flex-col max-md:rounded-[10px] max-md:p-4 ${className}`}
    variants={fadeRise}
  >
    <div className="mb-4 flex items-center gap-3">
      <div className="flex-1 flex justify-between items-center">
        <h3 className={`m-0 ${UI.overline}`}>Sources</h3>
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
          {selectedIds.length} selected
        </span>
      </div>
    </div>

    {/* Select All / Clear - tiny mono instrument keys */}
    <div className="mb-3 flex gap-2">
      <motion.button
        type="button"
        className={FILE_TOOL_BTN}
        onClick={() => onSelectionChange(files.map((f) => f.id))}
        disabled={disabled}
        {...keyPress}
      >
        Select All
      </motion.button>
      <motion.button
        type="button"
        className={FILE_TOOL_BTN}
        onClick={() => onSelectionChange([])}
        disabled={disabled}
        {...keyPress}
      >
        Clear
      </motion.button>
    </div>

    <div className="grid grid-cols-2 gap-2.5 auto-rows-min max-h-full overflow-y-auto p-1.25 flex-1 content-start scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-[1024px]:gap-3 max-md:grid-cols-1 max-md:gap-2">
      {files.length > 0 ? (
        files.map((file) => (
          <label
            key={file.id}
            className={fileRow(selectedIds.includes(file.id))}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={selectedIds.includes(file.id)}
              disabled={disabled}
              onChange={(e) => {
                if (e.target.checked) {
                  onSelectionChange([...selectedIds, file.id]);
                } else {
                  onSelectionChange(selectedIds.filter((id) => id !== file.id));
                }
              }}
            />
            {/* Square hairline checkbox */}
            <div className={fileCheckbox(selectedIds.includes(file.id))}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-ink overflow-hidden text-ellipsis whitespace-nowrap">
                {file.name}
              </span>
              <span className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-muted">
                {file.name.split(".").pop()?.toUpperCase()}
              </span>
            </div>
          </label>
        ))
      ) : (
        <div className="col-span-full flex flex-col items-center justify-center py-15 px-5 text-center gap-3">
          <Constellation name="sources" size={72} className="text-ink/35" />
          <p className="m-0 font-display text-[17px] font-semibold text-ink">
            {emptyTitle}
          </p>
          <span className="text-[13px] text-muted">{emptyHint}</span>
        </div>
      )}
    </div>
  </motion.div>
);

export default FileSelectionCard;
