import { motion, AnimatePresence } from "framer-motion";

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

const TAG_BASE =
  "flex items-center gap-1.5 rounded-full border-[1.5px] border-solid px-2 py-[5px]";
const TAG_REMOVE =
  "flex h-[18px] w-[18px] items-center justify-center rounded-full border-none bg-black/5 p-0 text-ink [transition:background-color_0.2s] hover:bg-black/10";
const ACTION_BTN =
  "flex items-center gap-[5px] border-none bg-transparent text-[14px] font-medium text-ink opacity-80 [transition:opacity_0.2s] hover:opacity-100";

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
    <div className="bg-cream px-5 py-2.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h4 className="m-0 text-[15px] font-semibold">Files for this message</h4>
        <div className="flex items-center gap-3">
          <button className={ACTION_BTN} onClick={onShowTagSelector}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Edit
          </button>
          <button className={ACTION_BTN} onClick={onClearAll}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Clear
          </button>
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
                className={`${TAG_BASE} border-ink bg-sage`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <span className="flex items-center justify-center text-ink">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
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
                <span className="text-[14px] font-medium">{classItem.name}</span>
                <button
                  className={TAG_REMOVE}
                  onClick={() => onRemoveTag("class", classItem.id)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </motion.div>
            );
          })}

          {selectedFileObjects.map((file) => (
            <motion.div
              key={file.id}
              className={`${TAG_BASE} border-ink bg-sage`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <span className="flex items-center justify-center text-ink">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
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
                <span className="text-[14px] font-medium">{file.name}</span>
                <span className="text-[10px] opacity-70">{file.className}</span>
              </div>
              <button
                className={TAG_REMOVE}
                onClick={() => onRemoveTag("file", file.id)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </motion.div>
          ))}

          {/* Uploaded files - shown with different visual style */}
          {uploadedFiles.map((file, index) => (
            <motion.div
              key={`uploaded-${index}`}
              className={`${TAG_BASE} border-[#3B82F6] bg-[#F0F9FF]`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              title="This file is only for this message"
            >
              <span className="flex items-center justify-center text-[#1D4ED8]">
                {file.base64 && file.type && file.type.startsWith("image/") ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
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
                    width="14"
                    height="14"
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
                <span className="text-[14px] font-medium">{file.name}</span>
                <span className="text-[10px] italic text-[#1D4ED8] opacity-70">
                  Uploaded
                </span>
              </div>
              <button
                className={TAG_REMOVE}
                onClick={() =>
                  onRemoveUploadedFile && onRemoveUploadedFile(index)
                }
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ContextTags;
