import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { motion } from "framer-motion";
import { Constellation, UI } from "@shared/components/atlas";
import { Button, CloseButton, IconButton } from "@shared/components/controls";
import Modal from "@shared/components/Modal";
import { spring } from "@shared/motion";

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

// Archive-drawer rows: hairline file entries; selected = verdigris wash.
const FILE_ITEM =
  "my-1 flex items-center rounded-md border border-solid p-2.5 transition-colors duration-150";

// Square hairline checkbox (appearance-none input) - checked = ink fill with a
// gold ✦ tick rendered by the sibling span (peer-checked). The input element
// itself is kept so refs/indeterminate keep working.
const CHECKBOX =
  "peer m-0 h-full w-full cursor-pointer appearance-none rounded-[4px] border border-solid border-ink/30 bg-white/70 transition-colors duration-150 hover:border-ink checked:border-ink checked:bg-ink indeterminate:border-ink";
const CHECKBOX_TICK =
  "pointer-events-none absolute hidden text-[10px] leading-none text-gold peer-checked:block";

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

  // Auto-expand classes when the picker opens (re-seeds each open now that the
  // Modal keeps this mounted across open/close).
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  // Reconcile initial selections on open: ensure selectedFiles includes files
  // from any initially selected classes, then mark a class as selected only
  // when all its files are selected. Prevents class/file state divergence.
  useEffect(() => {
    if (!isOpen) return;
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
    // Also reset the search filter each time the picker opens.
    setSearchTerm("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Handle class selection toggle: selecting a class means "select all files in it".
  // Deselecting a class removes its files from selection.
  const handleClassToggle = (classId: string) => {
    const classObj = classes.find((c) => c.id === classId);
    const fileIds =
      (classObj && classObj.files && classObj.files.map((f) => f.id)) || [];

    // Block empty classes from being tagged: with no files they contribute no
    // real context, yet would still be sent to the AI while showing nothing on
    // the user message. They're also rendered non-selectable in the list below.
    if (fileIds.length === 0) return;

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

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="md"
      sheetOnMobile
      hideClose
      ticks={false}
      className="px-0! py-0!"
    >
      {/* Full-bleed archive drawer: header band, search rail, scrolling ledger,
          action band. The Modal renders NO header or corner ticks here (they'd
          collide with these flush, edge-to-edge sections) - just the scrim,
          plate, Escape and scroll-lock. We own the sectioned contents. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4 border-0 border-b border-solid border-line px-6 py-4 max-[480px]:px-5">
          <div className="min-w-0">
            <p className={UI.overline}>Select sources</p>
            <h2 className="mt-1.5 font-display text-[22px] font-semibold leading-[1.25] tracking-[-0.01em] text-ink max-[480px]:text-[20px]">
              Select Study Material
            </h2>
          </div>
          <CloseButton
            onClick={onClose}
            label="Close source picker"
            className="-mr-1 shrink-0"
          />
        </div>
        <div className="border-0 border-b border-solid border-line px-6 py-4 max-[480px]:px-5">
          <div className="relative">
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
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              className="w-full rounded-lg border border-solid border-ink/20 bg-white/60 py-2.5 pl-10 pr-4 text-[15px] text-ink transition-colors placeholder:text-muted/60 focus:border-gold-deep focus:outline-none"
              placeholder="Search classes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="max-h-[50dvh] overflow-y-auto px-4 py-3 max-[480px]:px-3">
          {filteredClasses.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 p-[30px] text-center">
              <Constellation
                name="uncharted"
                size={64}
                className="text-ink/30"
              />
              <p className="m-0 font-display text-[16px] leading-[1.5] text-ink/75">
                No classes found matching your search
              </p>
            </div>
          ) : (
            filteredClasses.map((classItem) => {
              // A class with no files can't be tagged: it would be sent to the
              // AI (as a name with "0 files") while showing nothing on the sent
              // message. Render it visibly disabled with a "no files yet" hint.
              const isEmpty = !classItem.files || classItem.files.length === 0;
              return (
                <div
                  key={classItem.id}
                  className="mb-2 overflow-hidden rounded-lg border border-solid border-line bg-white/50"
                >
                  <div
                    className={`flex select-none items-center justify-between gap-2 px-3.5 py-2.5 ${
                      isEmpty
                        ? "cursor-not-allowed opacity-55"
                        : "cursor-pointer"
                    }`}
                  >
                    <div
                      className={`flex flex-1 items-center gap-2.5 py-1 ${
                        isEmpty ? "cursor-not-allowed" : "cursor-pointer"
                      }`}
                    >
                      <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                        <input
                          ref={(el) =>
                            (classCheckboxRefs.current[classItem.id] = el)
                          }
                          type="checkbox"
                          className={`${CHECKBOX} ${
                            isEmpty ? "disabled:cursor-not-allowed" : ""
                          }`}
                          checked={selectedClasses.includes(classItem.id)}
                          onChange={() => handleClassToggle(classItem.id)}
                          disabled={isEmpty}
                          aria-label={
                            isEmpty
                              ? `${classItem.name} has no files yet and can't be selected`
                              : `Select class ${classItem.name}`
                          }
                        />
                        <span className={CHECKBOX_TICK} aria-hidden="true">
                          ✦
                        </span>
                        <span
                          className="pointer-events-none absolute hidden h-[2px] w-[9px] rounded-full bg-ink peer-indeterminate:block"
                          aria-hidden="true"
                        ></span>
                      </span>
                      <label
                        className={`flex items-center gap-2 text-[14.5px] font-medium text-ink ${
                          isEmpty ? "cursor-not-allowed" : "cursor-pointer"
                        }`}
                        onClick={
                          isEmpty
                            ? undefined
                            : () => handleClassToggle(classItem.id)
                        }
                      >
                        <Constellation
                          name={classItem.name}
                          size={22}
                          className="shrink-0 text-verdi/70"
                        />
                        {classItem.name}
                      </label>
                    </div>

                    {isEmpty ? (
                      <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-muted/70">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="10"></circle>
                          <line
                            x1="4.93"
                            y1="4.93"
                            x2="19.07"
                            y2="19.07"
                          ></line>
                        </svg>
                        no files yet
                      </span>
                    ) : (
                      classItem.files &&
                      classItem.files.length > 0 && (
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                            {classItem.files.length} files
                          </div>
                          <IconButton
                            size="sm"
                            className="h-7! w-7! border-ink/20 text-ink/70 hover:border-gold-deep hover:text-gold-deep"
                            onClick={(e) => toggleExpand(classItem.id, e)}
                            label={
                              expandedClasses[classItem.id]
                                ? "Collapse files"
                                : "Expand files"
                            }
                          >
                            <motion.svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              animate={{
                                rotate: expandedClasses[classItem.id] ? 180 : 0,
                              }}
                              transition={spring.gentle}
                            >
                              <polyline points="6 9 12 15 18 9"></polyline>
                            </motion.svg>
                          </IconButton>
                        </div>
                      )
                    )}
                  </div>

                  {expandedClasses[classItem.id] &&
                    classItem.files &&
                    classItem.files.length > 0 && (
                      <div className="border-0 border-t border-solid border-line bg-cream/60 px-3 py-2">
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
              );
            })
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-0 border-t border-solid border-line px-6 py-4 max-[480px]:px-5">
          <div className="flex gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted max-[480px]:flex-col max-[480px]:gap-1">
            <span>{selectedClasses.length} classes selected</span>
            <span>{selectedFiles.length} files selected</span>
          </div>
          <div className="flex shrink-0 gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Cancel tag selection"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              aria-label="Apply tag selection"
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </Modal>
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
          ? "border-verdi/60 bg-sage/40 active:bg-sage/50"
          : "border-line bg-white/50 hover:border-ink/25 hover:bg-vellum active:bg-sage/30"
      }`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      data-fileid={file.id}
      data-classid={classId}
    >
      <div className="mr-2.5 flex items-center justify-center">
        <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            className={CHECKBOX}
          />
          <span className={CHECKBOX_TICK} aria-hidden="true">
            ✦
          </span>
        </span>
      </div>
      <div className="pointer-events-none flex flex-1 cursor-pointer items-center gap-2">
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] text-ink">
          {file.name}
        </span>
      </div>
    </div>
  );
}

export default TagSelector;
