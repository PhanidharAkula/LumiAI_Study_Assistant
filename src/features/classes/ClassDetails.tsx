import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@shared/lib/supabaseClient";
import FileViewer from "./FileViewer";
import ConfirmDialog from "@shared/components/ConfirmDialog";
import { useSearchParams } from "react-router-dom";
import { getFilePublicUrl } from "@shared/utils/storageUtils";
import { LoadingSignal } from "@shared/lib/loadingSignal";
import { Constellation, UI, starPath } from "@shared/components/atlas";
import { BackButton, IconButton, Spinner } from "@shared/components/controls";
import {
  DUR,
  fadeRise,
  fadeRiseSoft,
  pressLift,
  spring,
  stagger,
} from "@shared/motion";
import { useEscapeToClose } from "@shared/hooks/overlay";

// Study tools are heavy (pdf.js, AI) - load them only when opened.
const QuizComponent = lazy(() => import("@features/quiz/QuizComponent"));
const FlashcardsComponent = lazy(
  () => import("@features/flashcards/FlashcardsComponent")
);

// A class row from Supabase. Permissive - extra columns are allowed.
interface ClassData {
  id: string | number;
  name: string;
  description?: string | null;
  created_at: string;
  [key: string]: any;
}

// A stored file row from Supabase. Permissive index signature for extra cols.
interface FileRow {
  id: string | number;
  name: string;
  path?: string | null;
  type?: string | null;
  size?: number | null;
  created_at: string;
  [key: string]: any;
}

interface FileDeleteConfirmState {
  isOpen: boolean;
  fileId: string | number | null;
  filePath: string | null;
  fileName: string;
}

interface UploadConfirmState {
  isOpen: boolean;
  file: File | null;
  pendingFiles: File[];
  currentIndex: number;
}

interface Props {
  classData: ClassData | null;
  onBack: () => void;
}

const ClassDetails = ({ classData, onBack }: Props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [viewingFile, setViewingFile] = useState<FileRow | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileDeleteConfirm, setFileDeleteConfirm] =
    useState<FileDeleteConfirmState>({
      isOpen: false,
      fileId: null,
      filePath: null,
      fileName: "",
    });

  const [uploadConfirmData, setUploadConfirmData] =
    useState<UploadConfirmState>({
      isOpen: false,
      file: null,
      pendingFiles: [],
      currentIndex: 0,
    });

  // Surfaces file-op failures (load / view / delete / upload) to the user
  // instead of failing silently to the console.
  const [errorDialog, setErrorDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: "", message: "" });

  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Quiz state - initialize from URL parameter
  const [showQuiz, setShowQuiz] = useState(searchParams.get("quiz") === "true");
  // Flashcards state - initialize from URL parameter
  const [showFlashcards, setShowFlashcards] = useState(
    searchParams.get("flashcards") === "true"
  );

  useEffect(() => {
    if (classData) {
      fetchFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Escape closes the study-instruments menu (stacked - dialogs above win).
  useEscapeToClose(showMenu, () => setShowMenu(false));

  const fetchFiles = async () => {
    if (!classData?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("files")
        .select("*")
        .eq("class_id", classData.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFiles((data as FileRow[]) || []);
    } catch (err) {
      console.error("Error fetching files:", err);
      setErrorDialog({
        isOpen: true,
        title: "Couldn't load files",
        message: "We couldn't load this class's files. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileDelete = (
    fileId: string | number,
    filePath: string | null | undefined,
    fileName: string
  ) => {
    setFileDeleteConfirm({
      isOpen: true,
      fileId,
      filePath: filePath ?? null,
      fileName: fileName || "this file",
    });
  };

  const confirmFileDelete = async () => {
    try {
      const { fileId, filePath } = fileDeleteConfirm;

      if (filePath) {
        await supabase.storage.from("files").remove([filePath]);
      }

      const { error } = await supabase.from("files").delete().eq("id", fileId);

      if (error) throw error;

      setFiles((prev) => prev.filter((file) => file.id !== fileId));
    } catch (err) {
      console.error("Error deleting file:", err);
      setErrorDialog({
        isOpen: true,
        title: "Couldn't delete file",
        message: "We couldn't delete this file. Please try again.",
      });
    } finally {
      cancelFileDelete();
    }
  };

  const cancelFileDelete = () => {
    setFileDeleteConfirm({
      isOpen: false,
      fileId: null,
      filePath: null,
      fileName: "",
    });
  };

  const handleFileView = async (file: FileRow) => {
    try {
      const { url, error } = await getFilePublicUrl(
        "files",
        file.path as string
      );

      if (error || !url) {
        console.error("Error getting URL:", error);
        setErrorDialog({
          isOpen: true,
          title: "Couldn't open file",
          message: "We couldn't open this file. Please try again.",
        });
        return;
      }

      setViewingFile(file);
      setFileUrl(url);
    } catch (error) {
      console.error("Error viewing file:", error);
      setErrorDialog({
        isOpen: true,
        title: "Couldn't open file",
        message: "We couldn't open this file. Please try again.",
      });
    }
  };

  const handleCloseFileViewer = () => {
    setViewingFile(null);
    setFileUrl("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files as FileList);
    if (files.length > 0) {
      uploadFiles(files);
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      uploadFiles(files);
    }
  };

  const openFileSelector = () => {
    fileInputRef.current?.click();
  };

  const uploadFiles = async (filesToUpload: File[]) => {
    if (!filesToUpload.length) return;

    try {
      setUploading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setUploading(false);
        return;
      }

      setUploadConfirmData({
        isOpen: false,
        file: null,
        pendingFiles: filesToUpload,
        currentIndex: 0,
      });

      processNextFile(filesToUpload, 0, user);
    } catch (error) {
      console.error("Error in upload process:", error);
      setUploading(false);
    }
  };

  const processNextFile = async (files: File[], index: number, user: User) => {
    if (index >= files.length) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      fetchFiles();
      setUploading(false);
      return;
    }

    const currentFile = files[index];

    try {
      const { data: existingFiles } = await supabase
        .from("files")
        .select("name")
        .eq("class_id", classData!.id)
        .eq("name", currentFile.name);

      if (existingFiles && existingFiles.length > 0) {
        setUploadConfirmData({
          isOpen: true,
          file: currentFile,
          pendingFiles: files,
          currentIndex: index,
        });
      } else {
        await uploadSingleFile(currentFile, user);
        processNextFile(files, index + 1, user);
      }
    } catch (error) {
      console.error("Error processing file:", error);
      processNextFile(files, index + 1, user);
    }
  };

  const uploadSingleFile = async (file: File, user: User) => {
    try {
      const filePath = `${classData!.id}/${Date.now()}-${file.name.replace(
        /\s+/g,
        "_"
      )}`;

      const { error: uploadError } = await supabase.storage
        .from("files")
        .upload(filePath, file);

      if (uploadError) {
        console.error("File upload error:", uploadError);
        setErrorDialog({
          isOpen: true,
          title: "Upload failed",
          message: `Couldn't upload "${file.name}". Please try again.`,
        });
        return;
      }

      const { error: dbError } = await supabase.from("files").insert({
        name: file.name,
        size: file.size,
        type: file.type,
        path: filePath,
        class_id: classData!.id,
        user_id: user.id,
      });

      if (dbError) {
        console.error("Database error:", dbError);
        setErrorDialog({
          isOpen: true,
          title: "Upload failed",
          message: `Couldn't save "${file.name}". Please try again.`,
        });

        await supabase.storage
          .from("files")
          .remove([filePath])
          .catch((err) => console.error("Error cleaning up file:", err));
      }
    } catch (err) {
      console.error("Error uploading file:", err);
      setErrorDialog({
        isOpen: true,
        title: "Upload failed",
        message: `Couldn't upload "${file.name}". Please try again.`,
      });
    }
  };

  const handleConfirmUpload = async () => {
    const { file, pendingFiles, currentIndex } = uploadConfirmData;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUploadConfirmData({
      ...uploadConfirmData,
      isOpen: false,
    });

    await uploadSingleFile(file as File, user as User);

    processNextFile(pendingFiles, currentIndex + 1, user as User);
  };

  const handleCancelUpload = async () => {
    const { pendingFiles, currentIndex } = uploadConfirmData;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUploadConfirmData({
      ...uploadConfirmData,
      isOpen: false,
    });

    processNextFile(pendingFiles, currentIndex + 1, user as User);
  };

  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  const handleFlashcards = () => {
    setShowMenu(false);
    setShowFlashcards(true);
    // Add flashcards parameter to URL
    const params = new URLSearchParams(searchParams);
    params.set("flashcards", "true");
    setSearchParams(params, { replace: true });
  };

  const handleQuiz = () => {
    setShowMenu(false);
    setShowQuiz(true);
    // Add quiz parameter to URL
    const params = new URLSearchParams(searchParams);
    params.set("quiz", "true");
    setSearchParams(params, { replace: true });
  };

  function formatBytes(bytes: number | null | undefined) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i += 1;
    }
    return `${Math.round(val * 10) / 10} ${units[i]}`;
  }

  // Small in-file components for the study buttons so they include navigation.
  // `popup` keeps the desktop-inline vs mobile-popup mechanism:
  //   inline = hairline instrument pill (ink-fill on hover) - a btnClass-shaped
  //            variant string (custom hover colors can't stack on the kit's),
  //            with the lift/press feel from @shared/motion's pressLift,
  //   popup  = item row inside the vellum plate menu (color hover only).
  const studyButtonClass = (popup?: boolean) =>
    popup
      ? "hidden w-full max-md:flex cursor-pointer items-center justify-start gap-3 rounded-lg border-0 bg-transparent px-3.5 py-3 text-[14.5px] font-semibold text-ink transition-colors duration-150 hover:bg-cream/80 active:bg-cream"
      : "inline-flex max-md:hidden cursor-pointer items-center justify-center gap-2 rounded-full border border-solid border-ink/25 bg-transparent px-5 py-2.5 text-[13.5px] font-semibold text-ink transition-[color,background-color,border-color] duration-200 hover:border-ink hover:bg-ink hover:text-cream";

  function MotionFlashcardsButton({ popup }: { popup?: boolean }) {
    return (
      <motion.button
        className={studyButtonClass(popup)}
        {...(popup ? { whileTap: { scale: 0.98 } } : pressLift)}
        onClick={handleFlashcards}
      >
        {/* Card-deck emblem with a gold ✦ pressed into the top card. */}
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <g
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2.5" y="6.5" width="15.5" height="11.5" rx="1.6" />
            <path d="M7 3.5h12.1A1.9 1.9 0 0 1 21 5.4V14" />
          </g>
          <path d={starPath(10.2, 12.2, 3.1)} fill="var(--color-gold)" />
        </svg>
        Flashcards
      </motion.button>
    );
  }

  function MotionQuizButton({ popup }: { popup?: boolean }) {
    return (
      <motion.button
        className={studyButtonClass(popup)}
        {...(popup ? { whileTap: { scale: 0.98 } } : pressLift)}
        onClick={handleQuiz}
      >
        {/* Astrolabe emblem - graduated ring, gold star needle. */}
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <g stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <circle cx="12" cy="12" r="8.2" />
            <path d="M12 1.6v2.2M12 20.2v2.2M1.6 12h2.2M20.2 12h2.2" />
          </g>
          <path d={starPath(12, 12, 4.4)} fill="var(--color-gold)" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
        Quiz
      </motion.button>
    );
  }

  // Dropdown plate under the menu key - shared spring/duration, local geometry.
  const menuVariants: Variants = {
    hidden: { opacity: 0, y: -10, scale: 0.96 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: spring.plate,
    },
    exit: {
      opacity: 0,
      y: -10,
      scale: 0.96,
      transition: { duration: DUR.fast },
    },
  };

  if (!classData) return null;

  return (
    <motion.div
      className="h-full w-full pt-7.5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={spring.gentle}
    >
      {/* Hide all ClassDetails content when quiz or flashcards is open */}
      {!showQuiz && !showFlashcards && (
        <>
          <motion.div
            className="flex items-center gap-4 border-0 border-b border-solid border-line px-2.5 pb-5 max-md:gap-3"
            variants={stagger()}
            initial="hidden"
            animate="visible"
          >
            <BackButton
              onClick={onBack}
              label="Back to classes"
              variants={fadeRise}
            />

            {/* The class's own star-sign, drawn from its name. */}
            <motion.div
              className="shrink-0 text-verdi max-[480px]:hidden"
              variants={fadeRise}
              aria-hidden="true"
            >
              <Constellation
                name={classData.name}
                size={44}
                className="max-md:h-9 max-md:w-9"
              />
            </motion.div>

            <motion.div className="m-0 min-w-0 flex-1" variants={fadeRise}>
              {/* Eyebrow: record label + created date on one quiet line, so the
                  class name below can stand alone as the hero (2 lines, not 3). */}
              <p
                className={`${UI.overline} mb-1.5 flex flex-wrap items-center gap-x-2`}
              >
                <span>Class record</span>
                <span aria-hidden="true" className="text-ink/30">
                  ·
                </span>
                <span className="text-muted">
                  Created{" "}
                  {new Date(classData.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </p>
              <p className="m-0 font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-ink max-md:text-[23px]">
                {classData.name}
              </p>
            </motion.div>

            <motion.div
              className="m-0 flex items-center justify-end gap-3 max-[480px]:flex-wrap max-[480px]:gap-2.5"
              variants={fadeRise}
            >
              {/* Study tool buttons: navigate to full-screen study pages */}
              <MotionFlashcardsButton />
              <MotionQuizButton />
              {/* Mobile-only menu key (desktop shows the inline pills above). */}
              <div className="relative hidden max-md:block" ref={menuRef}>
                <IconButton
                  label="Study instruments"
                  variant="key"
                  onClick={toggleMenu}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </IconButton>

                <AnimatePresence>
                  {showMenu && (
                    <motion.div
                      className="absolute right-0 top-[calc(100%+10px)] z-10 flex w-65 flex-col gap-0.5 rounded-xl border border-solid border-line bg-vellum p-2 shadow-float"
                      variants={menuVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      {/* Mobile study-instrument menu - vellum plate rows. */}
                      <p className={`${UI.overlineMuted} px-3.5 pb-1.5 pt-2`}>
                        Study instruments
                      </p>
                      <div className="mx-2 mb-1 h-px border-0 bg-line" />
                      <MotionFlashcardsButton popup />
                      <MotionQuizButton popup />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            className="flex flex-col items-center justify-center gap-5 px-2.5 py-7.5 max-md:px-1"
            variants={stagger()}
            initial="hidden"
            animate="visible"
          >
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: {
                  duration: 0.4,
                },
              }}
              style={{ width: "100%" }}
            >
              <motion.div
                className={`group/drop mx-auto my-5 flex min-h-47.5 w-[60%] flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-7.5 transition-[border-color,background-color] duration-300 max-[1024px]:w-[80%] max-[1024px]:p-6.25 max-md:w-full max-md:min-h-40 max-md:p-5 ${
                  dragActive
                    ? "border-gold-deep bg-gold/10"
                    : "border-ink/30 bg-vellum/50 hover:border-ink/60 hover:bg-vellum/80"
                } ${uploading ? "cursor-default" : "cursor-pointer"}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={openFileSelector}
              >
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  ref={fileInputRef}
                />

                {uploading ? (
                  <div className="flex w-full max-w-70 flex-col items-center gap-3.5">
                    <Spinner />
                    <p className="text-[15px] font-semibold text-ink">
                      Uploading files...
                    </p>
                    {/* Thin gold thread sweeping along a hairline track. */}
                    <div
                      className="h-0.5 w-full overflow-hidden rounded-full bg-line"
                      aria-hidden="true"
                    >
                      <div className="h-full w-full animate-shimmer bg-linear-to-r from-transparent via-gold to-transparent bg-size-[200%_100%]" />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2.5 text-center">
                    {dragActive ? (
                      <svg
                        width="34"
                        height="34"
                        viewBox="0 0 24 24"
                        className="mb-1.5 animate-breathe text-gold-deep"
                        aria-hidden="true"
                      >
                        <path d={starPath(12, 12, 9)} fill="currentColor" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="34"
                        height="34"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mb-1.5 text-ink/60 transition-colors duration-300 group-hover/drop:text-gold-deep"
                        aria-hidden="true"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                    )}
                    <p
                      className={`${UI.overline} max-[480px]:tracking-[0.14em]`}
                    >
                      Add documents to this constellation
                    </p>
                    <p className={UI.overlineMuted}>
                      PDFs, docs, slides, images, notes, and more
                    </p>
                  </div>
                )}
              </motion.div>
            </motion.div>

            {loading ? (
              <motion.div
                className="flex w-full flex-col items-center justify-center py-15"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Spinner label="Loading files…" />
              </motion.div>
            ) : files.length === 0 ? (
              <motion.div
                className="flex flex-col items-center justify-center gap-3 p-7.5 text-center"
                variants={fadeRise}
              >
                {/* The class's constellation, waiting to be charted. */}
                <div className="mt-6 text-ink/35" aria-hidden="true">
                  <Constellation
                    name={classData.name}
                    size={150}
                    className="max-md:h-29.5 max-md:w-29.5"
                  />
                </div>
                <p className={UI.overlineMuted}>Empty plate</p>
                <p className="m-0 max-w-90 font-display text-[21px] font-medium leading-[1.45] text-ink/85 max-md:text-[19px]">
                  Nothing charted yet - add your{" "}
                  <em className="text-gold-deep">first document</em>.
                </p>
              </motion.div>
            ) : (
              <motion.div
                className="flex w-full flex-col max-md:py-2.5"
                variants={stagger(0.04, 0.05)}
                initial="hidden"
                animate={loading ? "hidden" : "visible"}
                key="files-grid"
              >
                {/* Catalogue header - the ledger's column rule. */}
                <div className="flex items-center justify-between gap-3 px-2 pb-2.5 max-md:px-1">
                  <span className={UI.overlineMuted}>
                    Catalogue · {files.length}{" "}
                    {files.length === 1 ? "document" : "documents"}
                  </span>
                  <span className="text-[11px] text-gold" aria-hidden="true">
                    ✦
                  </span>
                </div>
                <div className={UI.rule} />
                <AnimatePresence mode="wait">
                  {files.map((file) => (
                    <motion.div
                      key={file.id}
                      className="group relative flex w-full flex-row items-center gap-4 border-0 border-b border-solid border-line px-2 py-3.5 transition-colors duration-200 hover:bg-vellum/70 max-md:gap-3 max-md:px-1 max-md:py-3"
                      variants={fadeRiseSoft}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-solid border-line bg-cream/70 max-md:h-9 max-md:w-9">
                        {file.type?.includes("image") ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-verdi"
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
                        ) : file.type?.includes("pdf") ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-vermilion/90"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-ink/65"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="m-0 truncate text-[15.5px] font-semibold text-ink max-md:text-[14.5px]">
                          {file.name}
                        </h4>
                        <p className={`${UI.overlineMuted} mb-0 mt-1`}>
                          {formatBytes(file.size)} •{" "}
                          {new Date(file.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {/* Instrument keys - revealed on hover (always shown on mobile). */}
                      <div className="flex shrink-0 items-center justify-end gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-md:ml-1 max-md:gap-2 max-md:opacity-100">
                        <motion.button
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-solid border-ink/20 bg-transparent text-ink/70 transition-colors duration-150 hover:border-ink hover:bg-ink hover:text-cream max-md:h-8 max-md:w-8 [&_svg]:h-4 [&_svg]:w-4"
                          onClick={() => handleFileView(file)}
                          title="View file"
                          whileHover={{
                            scale: 1.1,
                            transition: {
                              type: "spring",
                              stiffness: 400,
                              damping: 10,
                            },
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </motion.button>
                        <motion.button
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-solid border-ink/20 bg-transparent text-ink/70 transition-colors duration-150 hover:border-vermilion hover:bg-vermilion hover:text-white max-md:h-8 max-md:w-8 [&_svg]:h-4 [&_svg]:w-4"
                          onClick={() =>
                            handleFileDelete(file.id, file.path, file.name)
                          }
                          title="Delete file"
                          whileHover={{
                            scale: 1.1,
                            transition: {
                              type: "spring",
                              stiffness: 400,
                              damping: 10,
                            },
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1-2 2v2"></path>
                          </svg>
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </motion.div>
          <AnimatePresence>
            {viewingFile && (
              <FileViewer
                file={viewingFile as any}
                url={fileUrl}
                onClose={handleCloseFileViewer}
              />
            )}
          </AnimatePresence>
          <ConfirmDialog
            isOpen={fileDeleteConfirm.isOpen}
            onClose={cancelFileDelete}
            onConfirm={confirmFileDelete}
            title="Delete File"
            message={`Are you sure you want to delete "${fileDeleteConfirm.fileName}"? This action cannot be undone.`}
            confirmText="Delete"
            danger={true}
          />
          <ConfirmDialog
            isOpen={uploadConfirmData.isOpen}
            onClose={handleCancelUpload}
            onConfirm={handleConfirmUpload}
            title="File Already Exists"
            message={`A file named "${uploadConfirmData.file?.name}" already exists. Do you want to upload it anyway?`}
            confirmText="Upload Anyway"
            cancelText="Skip"
            danger={false}
          />
          <ConfirmDialog
            isOpen={errorDialog.isOpen}
            onClose={() =>
              setErrorDialog({ isOpen: false, title: "", message: "" })
            }
            onConfirm={() =>
              setErrorDialog({ isOpen: false, title: "", message: "" })
            }
            title={errorDialog.title}
            message={errorDialog.message}
            confirmText="Got it"
            danger={false}
          />
        </>
      )}

      {/* Quiz Component */}
      <AnimatePresence>
        {showQuiz && (
          <Suspense fallback={<LoadingSignal />}>
            <QuizComponent
              isOpen={showQuiz}
              onClose={() => {
                setShowQuiz(false);
                // Remove quiz parameter from URL
                const params = new URLSearchParams(searchParams);
                params.delete("quiz");
                setSearchParams(params, { replace: true });
              }}
              classData={{ ...classData, files }}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Flashcards Component */}
      <AnimatePresence>
        {showFlashcards && (
          <Suspense fallback={<LoadingSignal />}>
            <FlashcardsComponent
              isOpen={showFlashcards}
              onClose={() => {
                setShowFlashcards(false);
                // Remove flashcards parameter from URL
                const params = new URLSearchParams(searchParams);
                params.delete("flashcards");
                setSearchParams(params, { replace: true });
              }}
              classData={{ ...classData, files } as any}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ClassDetails;
