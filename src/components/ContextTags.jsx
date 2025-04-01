import { motion, AnimatePresence } from "framer-motion";
import "./ContextTags.css";

const ContextTags = ({
  selectedClasses,
  selectedFiles,
  allClasses,
  onRemoveTag,
  onShowTagSelector,
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
  if (selectedClasses.length === 0 && selectedFiles.length === 0) {
    return null; // Return nothing when no tags are selected
  }

  return (
    <div className="context-tags-container">
      <div className="context-tags-header">
        <h4>Active Context</h4>
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
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ContextTags;
