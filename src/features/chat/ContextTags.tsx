import { motion, AnimatePresence } from "framer-motion";
import { keyPress, pressLift } from "@shared/motion";

interface ClassFile {
  id: string;
  name: string;
}

interface ClassItem {
  id: string;
  name: string;
  files?: ClassFile[];
}

interface SelectedFileObject extends ClassFile {
  className: string;
  classId: string;
}

interface UploadedFileTag {
  name?: string;
  type?: string;
  base64?: string;
}

interface ContextTagsProps {
  selectedClasses: string[];
  selectedFiles: string[];
  allClasses: ClassItem[];
  onRemoveTag: (type: string, id: string) => void;
  onShowTagSelector: () => void;
  uploadedFiles?: UploadedFileTag[];
  onRemoveUploadedFile?: (index: number) => void;
  onClearAll: () => void;
}

// Specimen labels - mono micro-pills pinned above the writing desk, all on the
// same hairline ring. Class = verdigris, file = ink, uploaded = gold.
const TAG_BASE =
  "flex items-center gap-1.5 rounded-full border border-solid px-2.5 py-1 font-mono text-[11.5px] leading-tight";
// Inline remove key inside a pill - inherits the pill's colour (text-current);
// the press pop comes from framer (`keyPress`), CSS animates opacity only.
const TAG_REMOVE =
  "flex h-4 w-4 max-md:h-6 max-md:w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-current opacity-55 transition-opacity duration-150 hover:opacity-100";
const ACTION_BTN =
  "flex cursor-pointer items-center gap-1 rounded-full border border-solid border-ink/20 bg-transparent px-2.5 py-1 max-md:px-3 max-md:py-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted transition-colors duration-150 hover:border-ink hover:text-ink";

const ContextTags = ({
  selectedClasses,
  selectedFiles,
  allClasses,
  onRemoveTag,
  onShowTagSelector,
  uploadedFiles = [],
  onRemoveUploadedFile,
  onClearAll,
}: ContextTagsProps) => {
  // Find class objects from IDs
  const selectedClassObjects = selectedClasses
    .map((classId) => allClasses.find((c) => c.id === classId))
    .filter(Boolean) as ClassItem[];

  // Find file objects from IDs
  const selectedFileObjects: SelectedFileObject[] = [];
  allClasses.forEach((classItem) => {
    if (classItem.files) {
      classItem.files.forEach((file) => {
        if (selectedFiles.includes(file.id)) {
          selectedFileObjects.push({
            ...file,
            className: classItem.name,
            classId: classItem.id,
          });
        }
      });
    }
  });

  // Empty state - show nothing instead of global context
  if (
    selectedClasses.length === 0 &&
    selectedFiles.length === 0 &&
    uploadedFiles.length === 0
  ) {
    return null; // Return nothing when no tags are selected
  }

  return (
    <div className="px-5 pb-0 pt-2.5 max-md:px-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="m-0 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
          Files for this message
        </h4>
        <div className="flex items-center gap-1.5">
          <motion.button
            type="button"
            className={ACTION_BTN}
            onClick={onShowTagSelector}
            aria-label="Edit selected sources"
            {...pressLift}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Edit
          </motion.button>
          <motion.button
            type="button"
            className={ACTION_BTN}
            onClick={onClearAll}
            aria-label="Clear all selected sources"
            {...pressLift}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Clear
          </motion.button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <AnimatePresence>
          {selectedClassObjects.map((classItem) => {
            // Count how many files from this class are selected
            const filesFromThisClass = selectedFileObjects.filter(
              (f) => f.classId === classItem.id
            );
            const hasSelectedFiles = filesFromThisClass.length > 0;
            const totalClassFiles =
              allClasses.find((c) => c.id === classItem.id)?.files?.length || 0;

            // If specific files are selected, don't show the class tag
            if (
              hasSelectedFiles &&
              filesFromThisClass.length !== totalClassFiles
            ) {
              return null;
            }

            return (
              <motion.div
                key={classItem.id}
                className={`${TAG_BASE} border-verdi/40 bg-sage/15 text-verdi`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <span className="flex shrink-0 items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                  </svg>
                </span>
                <span className="font-medium">{classItem.name}</span>
                <motion.button
                  type="button"
                  className={TAG_REMOVE}
                  onClick={() => onRemoveTag("class", classItem.id)}
                  aria-label={`Remove ${classItem.name}`}
                  {...keyPress}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </motion.button>
              </motion.div>
            );
          })}

          {selectedFileObjects.map((file) => (
            <motion.div
              key={file.id}
              className={`${TAG_BASE} border-ink/25 bg-vellum text-ink`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <span className="flex shrink-0 items-center justify-center opacity-70">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </span>
              <div className="flex flex-col">
                <span className="font-medium leading-[1.25]">{file.name}</span>
                <span className="text-[9px] uppercase leading-[1.25] tracking-[0.08em] opacity-60">
                  {file.className}
                </span>
              </div>
              <motion.button
                type="button"
                className={TAG_REMOVE}
                onClick={() => onRemoveTag("file", file.id)}
                aria-label={`Remove ${file.name}`}
                {...keyPress}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </motion.button>
            </motion.div>
          ))}

          {/* Uploaded files - shown with different visual style */}
          {uploadedFiles.map((file, index) => (
            <motion.div
              key={`uploaded-${index}`}
              className={`${TAG_BASE} border-gold-deep/40 bg-gold/10 text-gold-deep`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              title="This file is only for this message"
            >
              <span className="flex shrink-0 items-center justify-center">
                {file.base64 && file.type && file.type.startsWith("image/") ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="2"
                      ry="2"
                    ></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                  </svg>
                )}
              </span>
              <div className="flex flex-col">
                <span className="font-medium leading-[1.25]">{file.name}</span>
                <span className="text-[9px] uppercase leading-[1.25] tracking-[0.08em] opacity-80">
                  Uploaded
                </span>
              </div>
              <motion.button
                type="button"
                className={TAG_REMOVE}
                onClick={() =>
                  onRemoveUploadedFile && onRemoveUploadedFile(index)
                }
                aria-label={`Remove uploaded file ${file.name ?? ""}`.trim()}
                {...keyPress}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </motion.button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ContextTags;
