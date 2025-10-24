import { motion, AnimatePresence } from "framer-motion";
import "./ContextTags.css";

const ContextTags = ({
  selectedClasses,
  selectedFiles,
  allClasses,
  onRemoveTag,
  onShowTagSelector,
  uploadedFiles = [],
  onRemoveUploadedFile,
  onClearAll,
}) => {
  // Find class objects from IDs
  const selectedClassObjects = selectedClasses
    .map((classId) => allClasses.find((c) => c.id === classId))
    .filter(Boolean);

  // Find file objects from IDs
  const selectedFileObjects = [];
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
    <div className="context-tags-container">
      <div className="context-tags-header">
        <h4>Files for this message</h4>
        <div className="context-tags-actions">
          <button className="tag-edit-button" onClick={onShowTagSelector}>
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
          <button className="tag-clear-button" onClick={onClearAll}>
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

      <div className="context-tags-list">
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
                className="context-tag class-tag"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <span className="tag-icon">
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
                <span className="tag-text">{classItem.name}</span>
                <button
                  className="tag-remove-button"
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
              className="context-tag file-tag"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <span className="tag-icon">
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
              <div className="tag-text-container">
                <span className="tag-text">{file.name}</span>
                <span className="tag-subtext">{file.className}</span>
              </div>
              <button
                className="tag-remove-button"
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
              className="context-tag uploaded-file-tag"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              title="This file is only for this message"
            >
              <span className="tag-icon">
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
              <div className="tag-text-container">
                <span className="tag-text">{file.name}</span>
                <span className="tag-subtext">Uploaded</span>
              </div>
              <button
                className="tag-remove-button"
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
