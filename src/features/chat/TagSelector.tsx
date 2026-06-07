import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

interface ClassFile {
  id: string;
  name: string;
}

interface ClassItem {
  id: string;
  name: string;
  files?: ClassFile[];
}

interface TagSelection {
  selectedClasses: string[];
  selectedFiles: string[];
}

interface TagSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  classes?: ClassItem[];
  onSelectTags: (selection: TagSelection) => void;
  initialSelectedClasses?: string[];
  initialSelectedFiles?: string[];
}

const FOOTER_BTN =
  "rounded-full px-4 py-2 text-[small] font-medium [transition:all_0.2s] hover:-translate-y-1";
const FILE_ITEM =
  "my-[5px] flex items-center rounded-md border border-solid p-2.5 [transition:all_0.2s_ease]";

const TagSelector = ({
  isOpen,
  onClose,
  classes = [],
  onSelectTags,
  initialSelectedClasses = [],
  initialSelectedFiles = [],
}: TagSelectorProps) => {
  const [selectedClasses, setSelectedClasses] = useState<string[]>(
    initialSelectedClasses
  );
  const [selectedFiles, setSelectedFiles] =
    useState<string[]>(initialSelectedFiles);
  const [expandedClasses, setExpandedClasses] = useState<
    Record<string, boolean>
  >({});
  const classCheckboxRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [searchTerm, setSearchTerm] = useState("");

  // Auto-expand classes for initial load
  useEffect(() => {
    const expanded: Record<string, boolean> = {};

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile initial selections: ensure selectedFiles includes files from any
  // initially selected classes, then mark a class as selected only when all
  // its files are selected. This prevents divergence between class and file state.
  useEffect(() => {
    // start from provided arrays
    const initialFilesSet = new Set<string>(initialSelectedFiles || []);

    // If initialSelectedClasses provided, add their files to the file set
    (initialSelectedClasses || []).forEach((clsId) => {
      const cls = classes.find((c) => c.id === clsId);
      if (cls && cls.files) {
        cls.files.forEach((f) => initialFilesSet.add(f.id));
      }
    });

    // compute classes that are fully selected (all files selected)
    const fullySelectedClasses = new Set<string>();
    classes.forEach((c) => {
      const total = (c.files && c.files.length) || 0;
      if (total === 0) return; // don't auto-add empty classes
      const allSelected = (c.files as ClassFile[]).every((f) =>
        initialFilesSet.has(f.id)
      );
      if (allSelected) fullySelectedClasses.add(c.id);
    });

    setSelectedFiles(Array.from(initialFilesSet));
    setSelectedClasses(Array.from(fullySelectedClasses));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle class selection toggle: selecting a class means "select all files in it".
  // Deselecting a class removes its files from selection.
  const handleClassToggle = (classId: string) => {
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
  const directFileSelect = (fileId: string, classId: string) => {
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
  const toggleExpand = (classId: string, e?: MouseEvent) => {
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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-5">
      <div className="flex max-h-[80dvh] w-[90%] max-w-[500px] flex-col rounded-2xl border-[1.5px] border-solid border-ink bg-white shadow-[0px_4px_10px_rgba(0,0,0,0.1)]">
        <div className="flex items-center justify-between border-0 border-b-[1.5px] border-solid border-ink p-5">
          <h2 className="m-0 text-[20px] font-semibold">
            Select Study Material
          </h2>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-solid border-ink bg-sage shadow-[0px_1.5px_0_#000] [transition:all_0.2s_ease] hover:-translate-y-1"
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

        <div className="flex items-center gap-2.5 border-0 border-b-[1.5px] border-solid border-ink px-5 py-[15px]">
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
            className="flex-1 border-none bg-transparent text-[16px] outline-none"
            placeholder="Search classes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="max-h-[50dvh] overflow-y-auto p-2.5">
          {filteredClasses.length === 0 ? (
            <div className="p-[30px] text-center text-muted">
              <p>No classes found matching your search</p>
            </div>
          ) : (
            filteredClasses.map((classItem) => (
              <div
                key={classItem.id}
                className="mb-2.5 overflow-hidden rounded-xl border-[1.5px] border-solid border-ink"
              >
                <div className="flex cursor-pointer select-none items-center justify-between bg-sage px-[15px] py-3">
                  <div className="flex flex-1 cursor-pointer items-center gap-2.5 py-1">
                    <input
                      ref={(el) =>
                        (classCheckboxRefs.current[classItem.id] = el)
                      }
                      type="checkbox"
                      className="h-[18px] w-[18px] cursor-pointer accent-ink"
                      checked={selectedClasses.includes(classItem.id)}
                      onChange={() => handleClassToggle(classItem.id)}
                      aria-label={`Select class ${classItem.name}`}
                    />
                    <label
                      className="cursor-pointer font-medium"
                      onClick={() => handleClassToggle(classItem.id)}
                    >
                      {classItem.name}
                    </label>
                  </div>

                  {classItem.files && classItem.files.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="text-[12px] text-muted">
                        {classItem.files.length} files
                      </div>
                      <button
                        type="button"
                        className="flex cursor-pointer items-center gap-[5px] rounded-[50px] border-[1.5px] border-solid border-ink bg-[#f0f0f0] p-1 text-[12px] font-medium text-ink shadow-[0px_1px_0_#000] [transition:all_0.2s_ease] hover:-translate-y-[3px]"
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
                    <div className="mt-[5px] border-0 border-t border-solid border-black/10 bg-[#f9f9f9] px-[15px] py-2.5">
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

        <div className="mt-auto flex items-center justify-between border-0 border-t-[1.5px] border-solid border-ink px-5 py-[15px]">
          <div className="flex gap-5 text-[14px] text-muted">
            <span>{selectedClasses.length} classes selected</span>
            <span>{selectedFiles.length} files selected</span>
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              className={`${FOOTER_BTN} border-[1.5px] border-solid border-ink bg-transparent text-ink`}
              onClick={onClose}
              aria-label="Cancel tag selection"
              title="Cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${FOOTER_BTN} border-[1.5px] border-solid border-ink bg-sage text-ink shadow-[0px_2px_0_#000]`}
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
interface FileItemProps {
  file: ClassFile;
  classId: string;
  isSelected: boolean;
  onSelect: (fileId: string, classId: string) => void;
}

function FileItem({ file, classId, isSelected, onSelect }: FileItemProps) {
  const handleClick = (e: MouseEvent) => {
    e.stopPropagation(); // Stop event propagation
    onSelect(file.id, classId);
  };

  const handleCheckboxChange = (e: ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onSelect(file.id, classId);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onSelect(file.id, classId);
    }
  };

  return (
    <div
      className={`${FILE_ITEM} ${
        isSelected
          ? "border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.1)] active:bg-[rgba(139,92,246,0.15)]"
          : "border-black/10 bg-white hover:border-black/20 hover:bg-[#f5f5f5] active:bg-[rgba(139,92,246,0.15)]"
      }`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      data-fileid={file.id}
      data-classid={classId}
    >
      <div className="mr-2 flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          className="h-[18px] w-[18px] cursor-pointer accent-ink"
        />
      </div>
      <div className="pointer-events-none flex flex-1 cursor-pointer items-center gap-2">
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px]">
          {file.name}
        </span>
      </div>
    </div>
  );
}

export default TagSelector;
