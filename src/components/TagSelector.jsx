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
  const classCheckboxRefs = useRef({});
  const [searchTerm, setSearchTerm] = useState("");

  // Auto-expand classes for initial load
  useEffect(() => {
    const expanded = {};

    // Auto-expand classes that have selected files
    initialSelectedFiles.forEach((fileId) => {
      classes.forEach((classItem) => {
        if (classItem.files?.some((f) => f.id === fileId)) {
          expanded[classItem.id] = true;
        }
      });
    });

    // Also expand explicitly-selected classes
    initialSelectedClasses.forEach((id) => {
      expanded[id] = true;
    });

    setExpandedClasses(expanded);
  }, []);

  // Reconcile initial selections: ensure selectedFiles includes files from any
  // initially selected classes, then mark a class as selected only when all
  // its files are selected. This prevents divergence between class and file state.
  useEffect(() => {
    // start from provided arrays
    const initialFilesSet = new Set(initialSelectedFiles || []);

    // If initialSelectedClasses provided, add their files to the file set
    (initialSelectedClasses || []).forEach((clsId) => {
      const cls = classes.find((c) => c.id === clsId);
      if (cls && cls.files) {
        cls.files.forEach((f) => initialFilesSet.add(f.id));
      }
    });

    // compute classes that are fully selected (all files selected)
    const fullySelectedClasses = new Set();
    classes.forEach((c) => {
      const total = (c.files && c.files.length) || 0;
      if (total === 0) return; // don't auto-add empty classes
      const allSelected = c.files.every((f) => initialFilesSet.has(f.id));
      if (allSelected) fullySelectedClasses.add(c.id);
    });

    setSelectedFiles(Array.from(initialFilesSet));
    setSelectedClasses(Array.from(fullySelectedClasses));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle class selection toggle: selecting a class means "select all files in it".
  // Deselecting a class removes its files from selection.
  const handleClassToggle = (classId) => {
    const classObj = classes.find((c) => c.id === classId);
    const fileIds =
      (classObj && classObj.files && classObj.files.map((f) => f.id)) || [];

    // if class is currently fully selected, deselect it
    if (selectedClasses.includes(classId)) {
      setSelectedClasses((prev) => prev.filter((id) => id !== classId));
      setSelectedFiles((prevFiles) =>
        prevFiles.filter((id) => !fileIds.includes(id))
      );
      return;
    }

    // otherwise select all files from this class and mark class as selected
    setSelectedFiles((prevFiles) =>
      Array.from(new Set([...(prevFiles || []), ...fileIds]))
    );
    setSelectedClasses((prev) =>
      Array.from(new Set([...(prev || []), classId]))
    );
  };

  // Direct file selection handler: toggle a single file, and reconcile the parent
  // class selection: a class is considered selected only when ALL its files are selected.
  const directFileSelect = (fileId, classId) => {
    const classObj = classes.find((c) => c.id === classId);
    const classFileIds =
      (classObj && classObj.files && classObj.files.map((f) => f.id)) || [];
    const isCurrentlySelected = selectedFiles.includes(fileId);

    if (isCurrentlySelected) {
      // remove file
      setSelectedFiles((prev) => {
        const newFiles = (prev || []).filter((id) => id !== fileId);
        // after removal, check if all files of the class are still selected
        const allStillSelected = classFileIds.every((id) =>
          newFiles.includes(id)
        );
        if (!allStillSelected) {
          setSelectedClasses((prevCls) =>
            prevCls.filter((id) => id !== classId)
          );
        }
        return newFiles;
      });
    } else {
      // add file
      setSelectedFiles((prev) => {
        const newFiles = Array.from(new Set([...(prev || []), fileId]));
        // if after adding, all files in the class are selected, mark class as selected
        const allNowSelected =
          classFileIds.length > 0 &&
          classFileIds.every((id) => newFiles.includes(id));
        if (allNowSelected) {
          setSelectedClasses((prevCls) =>
            Array.from(new Set([...(prevCls || []), classId]))
          );
        }
        return newFiles;
      });
    }
  };

  // Toggle class expansion (only from dropdown button)
  const toggleExpand = (classId, e) => {
    if (e) e.stopPropagation();
    setExpandedClasses((prev) => ({ ...prev, [classId]: !prev[classId] }));
  };

  // Handle save button click
  const handleSave = () => {
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

  // Reflect partial class selection (some-but-not-all files) as an
  // indeterminate checkbox. Must run before any early return (Rules of Hooks).
  useEffect(() => {
    classes.forEach((c) => {
      const ref = classCheckboxRefs.current[c.id];
      if (!ref) return;
      const total = (c.files && c.files.length) || 0;
      const selectedFromClass = (c.files || []).filter((f) =>
        selectedFiles.includes(f.id)
      ).length;
      ref.indeterminate = selectedFromClass > 0 && selectedFromClass < total;
    });
  }, [selectedFiles, classes, selectedClasses]);

  if (!isOpen) return null;

  return (
    <div className="tag-selector-overlay">
      <div className="tag-selector-container">
        <div className="tag-selector-header">
          <h2>Select Study Material</h2>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="Close tag selector"
            title="Close"
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
          </button>
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
                  <div className="tag-checkbox">
                    <input
                      ref={(el) =>
                        (classCheckboxRefs.current[classItem.id] = el)
                      }
                      type="checkbox"
                      checked={selectedClasses.includes(classItem.id)}
                      onChange={() => handleClassToggle(classItem.id)}
                      aria-label={`Select class ${classItem.name}`}
                    />
                    <label onClick={() => handleClassToggle(classItem.id)}>
                      {classItem.name}
                    </label>
                  </div>

                  {classItem.files && classItem.files.length > 0 && (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <div
                        className="files-count"
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary-color)",
                        }}
                      >
                        {classItem.files.length} files
                      </div>
                      <button
                        type="button"
                        className="expand-button-prominent"
                        onClick={(e) => toggleExpand(classItem.id, e)}
                        aria-label={
                          expandedClasses[classItem.id]
                            ? "Collapse files"
                            : "Expand files"
                        }
                        title={
                          expandedClasses[classItem.id]
                            ? "Collapse files"
                            : "Expand files"
                        }
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
                      </button>
                    </div>
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
            <button
              type="button"
              className="cancel-button"
              onClick={onClose}
              aria-label="Cancel tag selection"
              title="Cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              className="apply-button"
              onClick={handleSave}
              aria-label="Apply tag selection"
              title="Apply"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// New FileItem component for better isolation and debugging
function FileItem({ file, classId, isSelected, onSelect }) {
  const handleClick = (e) => {
    e.stopPropagation(); // Stop event propagation
    onSelect(file.id, classId);
  };

  const handleCheckboxChange = (e) => {
    e.stopPropagation();
    onSelect(file.id, classId);
  };

  const handleKeyDown = (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onSelect(file.id, classId);
    }
  };

  return (
    <div
      className={`tag-file-item ${isSelected ? "selected" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      data-fileid={file.id}
      data-classid={classId}
    >
      <div className="file-checkbox-wrapper">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          className="file-checkbox"
        />
      </div>
      <div className="file-label-wrapper">
        {/* <svg
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
        </svg> */}
        <span className="file-name">{file.name}</span>
      </div>
    </div>
  );
}

export default TagSelector;
