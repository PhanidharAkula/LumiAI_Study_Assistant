import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import "./TagSelector.css";

const TagSelector = ({
  isOpen,
  onClose,
  classes = [],
  onSelectTags,
  initialSelectedClasses = [],
  initialSelectedFiles = [],
}) => {
  const [selectedClasses, setSelectedClasses] = useState(
    initialSelectedClasses
  );
  const [selectedFiles, setSelectedFiles] = useState(initialSelectedFiles);
  const [expandedClasses, setExpandedClasses] = useState({});
  const [searchTerm, setSearchTerm] = useState("");

  console.log("TagSelector render - selectedFiles:", selectedFiles);
  console.log("TagSelector render - selectedClasses:", selectedClasses);

  // Auto-expand classes for initial load
  useEffect(() => {
    console.log("Setting up initial expanded state");
    console.log("Initial selected files:", initialSelectedFiles);
    console.log("Initial selected classes:", initialSelectedClasses);

    const expanded = {};

    // Auto-expand classes with selected files
    initialSelectedFiles.forEach((fileId) => {
      classes.forEach((classItem) => {
        if (classItem.files) {
          const fileFound = classItem.files.some((f) => f.id === fileId);
          if (fileFound) {
            expanded[classItem.id] = true;
            console.log(
              `Auto-expanding class ${classItem.id} for file ${fileId}`
            );
          }
        }
      });
    });

    // Also expand selected classes
    initialSelectedClasses.forEach((id) => {
      expanded[id] = true;
      console.log(`Auto-expanding selected class ${id}`);
    });

    setExpandedClasses(expanded);
  }, []);

  // Handle class selection toggle
  const handleClassToggle = (classId) => {
    console.log(`Toggling class selection for ${classId}`);

    setSelectedClasses((prev) => {
      if (prev.includes(classId)) {
        // Deselect class
        console.log(`Deselecting class: ${classId}`);

        // Also deselect all files from this class
        const classObj = classes.find((c) => c.id === classId);
        if (classObj && classObj.files && classObj.files.length > 0) {
          const filesToRemove = classObj.files.map((f) => f.id);
          console.log(`Files to remove: ${filesToRemove.join(", ")}`);

          setSelectedFiles((prevFiles) => {
            const newSelection = prevFiles.filter(
              (id) => !filesToRemove.includes(id)
            );
            console.log(`New file selection: ${newSelection.join(", ")}`);
            return newSelection;
          });
        }

        return prev.filter((id) => id !== classId);
      } else {
        // Select class and expand it
        console.log(`Selecting class: ${classId}`);
        setExpandedClasses((prev) => ({ ...prev, [classId]: true }));
        return [...prev, classId];
      }
    });
  };

  // Direct file selection handler - completely rewritten for debugging
  const directFileSelect = (fileId, classId) => {
    console.log(`DIRECT FILE SELECT: file=${fileId}, class=${classId}`);

    // Toggle file selection status
    const isCurrentlySelected = selectedFiles.includes(fileId);

    if (isCurrentlySelected) {
      console.log(`Removing file ${fileId} from selection`);
      setSelectedFiles((prev) => prev.filter((id) => id !== fileId));
    } else {
      console.log(`Adding file ${fileId} to selection`);
      setSelectedFiles((prev) => [...prev, fileId]);

      // Make sure parent class is selected
      if (!selectedClasses.includes(classId)) {
        console.log(`Also selecting parent class ${classId}`);
        setSelectedClasses((prev) => [...prev, classId]);
      }
    }
  };

  // Toggle class expansion
  const toggleExpand = (classId, e) => {
    if (e) {
      e.stopPropagation();
    }

    console.log(`Toggling expansion for class ${classId}`);
    setExpandedClasses((prev) => {
      const newState = { ...prev, [classId]: !prev[classId] };
      console.log(
        `Class ${classId} is now ${
          newState[classId] ? "expanded" : "collapsed"
        }`
      );
      return newState;
    });
  };

  // Handle save button click
  const handleSave = () => {
    console.log("Saving selections");
    console.log("Selected classes:", selectedClasses);
    console.log("Selected files:", selectedFiles);

    onSelectTags({
      selectedClasses,
      selectedFiles,
    });
    onClose();
  };

  // Filter classes based on search term
  const filteredClasses = searchTerm
    ? classes.filter((c) =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : classes;

  if (!isOpen) return null;

  return (
    <div className="tag-selector-overlay">
      <div className="tag-selector-container">
        <div className="tag-selector-header">
          <h2>Select Study Material</h2>
          <motion.button
            className="close-button"
            onClick={onClose}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 500, damping: 15 }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
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
          </motion.button>
        </div>

        <div className="tag-selector-search">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search classes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="tag-selector-list">
          {filteredClasses.length === 0 ? (
            <div className="no-classes-found">
              <p>No classes found matching your search</p>
            </div>
          ) : (
            filteredClasses.map((classItem) => (
              <div key={classItem.id} className="tag-class-item">
                <div className="tag-class-header">
                  <motion.div
                    className="tag-checkbox"
                    onClick={() => handleClassToggle(classItem.id)}
                    whileHover={{ backgroundColor: "rgba(0, 0, 0, 0.03)" }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedClasses.includes(classItem.id)}
                      readOnly
                    />
                    <label>{classItem.name}</label>
                  </motion.div>

                  {classItem.files && classItem.files.length > 0 && (
                    <motion.button
                      type="button"
                      className="expand-button"
                      onClick={(e) => toggleExpand(classItem.id, e)}
                      whileHover={{
                        scale: 1.1,
                        backgroundColor: "var(--background-secondary-color)",
                      }}
                      whileTap={{ scale: 0.95 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 15,
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          transform: expandedClasses[classItem.id]
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                          transition: "transform 0.3s",
                        }}
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </motion.button>
                  )}
                </div>

                {expandedClasses[classItem.id] &&
                  classItem.files &&
                  classItem.files.length > 0 && (
                    <div className="tag-files-list">
                      {classItem.files.map((file) => (
                        <FileItem
                          key={file.id}
                          file={file}
                          classId={classItem.id}
                          isSelected={selectedFiles.includes(file.id)}
                          onSelect={directFileSelect}
                        />
                      ))}
                    </div>
                  )}
              </div>
            ))
          )}
        </div>

        <div className="tag-selector-footer">
          <div className="tag-summary">
            <span>{selectedClasses.length} classes selected</span>
            <span>{selectedFiles.length} files selected</span>
          </div>
          <div className="tag-actions">
            <motion.button
              type="button"
              className="cancel-button"
              onClick={onClose}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              Cancel
            </motion.button>
            <motion.button
              type="button"
              className="apply-button"
              onClick={handleSave}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              Apply
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};

// New FileItem component with Framer Motion
function FileItem({ file, classId, isSelected, onSelect }) {
  const handleClick = (e) => {
    e.stopPropagation();
    onSelect(file.id, classId);
  };

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onSelect(file.id, classId);
  };

  return (
    <motion.div
      className={`tag-file-item ${isSelected ? "selected" : ""}`}
      onClick={handleClick}
      data-fileid={file.id}
      data-classid={classId}
      whileHover={{
        backgroundColor: isSelected ? "rgba(139, 92, 246, 0.15)" : "#f5f5f5",
        scale: 1.01,
      }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
    >
      <div className="file-checkbox-wrapper">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}} // Empty change handler to avoid React warnings
          onClick={handleCheckboxClick}
          className="file-checkbox"
        />
      </div>
      <div className="file-label-wrapper">
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
          className="file-icon"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <span className="file-name">{file.name}</span>
      </div>
    </motion.div>
  );
}

export default TagSelector;
