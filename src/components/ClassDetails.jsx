import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import FileViewer from "./FileViewer";
import AddClassForm from "./AddClassForm";
import ConfirmDialog from "./ConfirmDialog";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { getFilePublicUrl } from "../utils/storageUtils";
import "./ClassDetails.css";

// Study tools are heavy (pdf.js, AI) — load them only when opened.
const QuizComponent = lazy(() => import("./QuizComponent"));
const FlashcardsComponent = lazy(() => import("./FlashcardsComponent"));

const ClassDetails = ({
  classData,
  isEditing,
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  onBack,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);
  const [fileUrl, setFileUrl] = useState("");
  const fileInputRef = useRef(null);
  const [deleteConfirmData, setDeleteConfirmData] = useState({
    isOpen: false,
    hasFiles: false,
    fileCount: 0,
  });

  const [fileDeleteConfirm, setFileDeleteConfirm] = useState({
    isOpen: false,
    fileId: null,
    filePath: null,
    fileName: "",
  });

  const [uploadConfirmData, setUploadConfirmData] = useState({
    isOpen: false,
    file: null,
    pendingFiles: [],
    currentIndex: 0,
  });

  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  // Quiz state - initialize from URL parameter
  const [showQuiz, setShowQuiz] = useState(searchParams.get("quiz") === "true");
  // Flashcards state - initialize from URL parameter
  const [showFlashcards, setShowFlashcards] = useState(
    searchParams.get("flashcards") === "true"
  );
  const [comingSoonConfirm, setComingSoonConfirm] = useState({
    isOpen: false,
    feature: "",
  });

  useEffect(() => {
    if (classData) {
      fetchFiles();
    }
  }, [classData]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      setFiles(data || []);
    } catch (err) {
      console.error("Error fetching files:", err);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = () => {
    if (files.length > 0) {
      setDeleteConfirmData({
        isOpen: true,
        hasFiles: true,
        fileCount: files.length,
      });
    } else {
      setDeleteConfirmData({
        isOpen: true,
        hasFiles: false,
        fileCount: 0,
      });
    }
  };

  const handleConfirmDelete = () => {
    setDeleteConfirmData({
      isOpen: false,
      hasFiles: false,
      fileCount: 0,
    });
    onDelete(classData.id);
  };

  const handleCancelDelete = () => {
    setDeleteConfirmData({
      isOpen: false,
      hasFiles: false,
      fileCount: 0,
    });
  };

  const handleFileDelete = (fileId, filePath, fileName) => {
    setFileDeleteConfirm({
      isOpen: true,
      fileId,
      filePath,
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

  const handleFileView = async (file) => {
    try {
      const { url, error } = await getFilePublicUrl("files", file.path);

      if (error) {
        console.error("Error getting URL:", error);
        return;
      }

      if (url) {
        setViewingFile(file);
        setFileUrl(url);
      } else {
        console.error("No URL returned");
      }
    } catch (error) {
      console.error("Error viewing file:", error);
    }
  };

  const handleCloseFileViewer = () => {
    setViewingFile(null);
    setFileUrl("");
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      uploadFiles(files);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
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

  const uploadFiles = async (filesToUpload) => {
    if (!filesToUpload.length) return;

    try {
      setUploading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
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

  const processNextFile = async (files, index, user) => {
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
        .eq("class_id", classData.id)
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

  const uploadSingleFile = async (file, user) => {
    try {
      const filePath = `${classData.id}/${Date.now()}-${file.name.replace(
        /\s+/g,
        "_"
      )}`;

      const { error: uploadError } = await supabase.storage
        .from("files")
        .upload(filePath, file);

      if (uploadError) {
        console.error("File upload error:", uploadError);
        return;
      }

      const { error: dbError } = await supabase.from("files").insert({
        name: file.name,
        size: file.size,
        type: file.type,
        path: filePath,
        class_id: classData.id,
        user_id: user.id,
      });

      if (dbError) {
        console.error("Database error:", dbError);

        await supabase.storage
          .from("files")
          .remove([filePath])
          .catch((err) => console.error("Error cleaning up file:", err));
      }
    } catch (err) {
      console.error("Error uploading file:", err);
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

    await uploadSingleFile(file, user);

    processNextFile(pendingFiles, currentIndex + 1, user);
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

    processNextFile(pendingFiles, currentIndex + 1, user);
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

  function formatBytes(bytes) {
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  // Small in-file components for the study buttons so they include navigation
  function MotionFlashcardsButton() {
    return (
      <motion.button
        className="study-tool-button flashcards-button"
        whileTap={{ scale: 0.98 }}
        onClick={handleFlashcards}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        Flashcards
      </motion.button>
    );
  }

  function MotionQuizButton() {
    return (
      <motion.button
        className="study-tool-button quiz-button"
        whileTap={{ scale: 0.98 }}
        onClick={handleQuiz}
      >
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
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        Quiz
      </motion.button>
    );
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 12,
      },
    },
  };

  const fileCardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: ({ index, loaded }) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.15,
        delay: index * 0.05,
        when: "afterChildren",
      },
    }),
    hover: {
      y: -5,
      scale: 1.01,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 8,
      },
    },
    tap: { scale: 0.98 },
  };

  const menuVariants = {
    hidden: { opacity: 0, y: -20, scale: 0.8 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 20,
      },
    },
    exit: {
      opacity: 0,
      y: -20,
      scale: 0.8,
      transition: { duration: 0.2 },
    },
  };

  if (!classData) return null;

  if (isEditing) {
    return (
      <div className="add-class-container">
        <AddClassForm
          isEditing={true}
          initialData={classData}
          onCancel={onCancelEdit}
          onClassUpdated={onUpdate}
        />
      </div>
    );
  }

  return (
    <motion.div
      className="class-details-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ type: "spring", stiffness: 100, damping: 15 }}
    >
      {/* Hide all ClassDetails content when quiz or flashcards is open */}
      {!showQuiz && !showFlashcards && (
        <>
          <motion.div
            className="class-header"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.button
              className="back-button"
              onClick={onBack}
              variants={itemVariants}
              whileHover={{
                x: -3,
                transition: { type: "spring", stiffness: 300, damping: 5 },
              }}
              whileTap={{ scale: 0.98 }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </motion.button>

            <motion.div className="class-info" variants={itemVariants}>
              <p className="class-info-name">{classData.name}</p>
              <p className="class-meta">
                Created on {new Date(classData.created_at).toLocaleDateString()}
              </p>
            </motion.div>

            <motion.div className="class-actions" variants={itemVariants}>
              {/* Study tool buttons: navigate to full-screen study pages */}
              <MotionFlashcardsButton />
              <MotionQuizButton />
              <div className="menu-container" ref={menuRef}>
                <motion.button
                  className="menu-button"
                  onClick={toggleMenu}
                  whileHover={{
                    scale: 1.05,
                    transition: { type: "spring", stiffness: 300, damping: 5 },
                  }}
                  whileTap={{ scale: 0.98 }}
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
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </motion.button>

                <AnimatePresence>
                  {showMenu && (
                    <motion.div
                      className="menu-popup"
                      variants={menuVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      {/* Intentionally empty: no menu items on ClassDetails */}
                      <MotionFlashcardsButton />
                      <MotionQuizButton />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            className="files-section"
            variants={containerVariants}
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
                className={`upload-container ${
                  dragActive ? "drag-active" : ""
                } ${uploading ? "uploading" : ""}`}
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
                  className="file-input"
                  ref={fileInputRef}
                  accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.py,.ipynb,.zip,.rar,.csv,.xlsx,.xls,.md"
                />

                {uploading ? (
                  <div className="upload-status">
                    <div className="spinner"></div>
                    <p>Uploading files...</p>
                  </div>
                ) : (
                  <div className="upload-prompt">
                    <div className="upload-icon">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="30"
                        height="30"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                    </div>
                    <p className="upload-text">
                      Upload Files or Drag & Drop Here
                    </p>
                    <p className="file-types">PDF, DOC, PPT, JPG, PNG, etc.</p>
                  </div>
                )}
              </motion.div>
            </motion.div>

            {loading ? (
              <motion.div
                className="loading-files"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="spinner"></div>
                <span>Loading files...</span>
              </motion.div>
            ) : files.length === 0 ? (
              <motion.div className="empty-files" variants={itemVariants}>
                <div className="empty-files-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                  </svg>
                </div>
                <h4>No Files Yet</h4>
                <p>Upload files to get started</p>
              </motion.div>
            ) : (
              <motion.div
                className="files-grid"
                variants={containerVariants}
                initial="hidden"
                animate={loading ? "hidden" : "visible"}
                key="files-grid"
              >
                <AnimatePresence mode="wait">
                  {files.map((file, i) => (
                    <motion.div
                      key={file.id}
                      className="file-card"
                      custom={{ index: i, loaded: !loading }}
                      variants={fileCardVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <div
                        className={`file-icon ${
                          file.type?.includes("image")
                            ? "file-icon-image"
                            : file.type?.includes("pdf")
                            ? "file-icon-pdf"
                            : file.type?.includes("word") ||
                              file.type?.includes("doc")
                            ? "file-icon-doc"
                            : file.type?.includes("spreadsheet") ||
                              file.type?.includes("excel") ||
                              file.type?.includes("csv")
                            ? "file-icon-sheet"
                            : "file-icon-default"
                        }`}
                      >
                        {file.type?.includes("image") ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
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
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
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
                            width="24"
                            height="24"
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
                        )}
                      </div>
                      <div className="file-details">
                        <h4 className="file-name">{file.name}</h4>
                        <p className="file-meta">
                          {formatBytes(file.size)} •{" "}
                          {new Date(file.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="file-actions">
                        <motion.button
                          className="file-action-btn view-btn"
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
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </motion.button>
                        <motion.button
                          className="file-action-btn delete-btn"
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
                            strokeWidth="2"
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
                file={viewingFile}
                url={fileUrl}
                onClose={handleCloseFileViewer}
              />
            )}
          </AnimatePresence>
          {/* Study pages are opened in full-screen routes now */}
          <ConfirmDialog
            isOpen={deleteConfirmData.isOpen}
            onClose={handleCancelDelete}
            onConfirm={handleConfirmDelete}
            title={
              deleteConfirmData.hasFiles
                ? "Delete Class and Files"
                : "Delete Class"
            }
            message={
              deleteConfirmData.hasFiles
                ? `This class contains ${deleteConfirmData.fileCount} file(s). Deleting the class will also delete all associated files. This action cannot be undone. Are you sure you want to proceed?`
                : `Are you sure you want to delete ${classData?.name}? This action cannot be undone.`
            }
            confirmText={deleteConfirmData.hasFiles ? "Delete All" : "Delete"}
            danger={true}
          />
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
            isOpen={comingSoonConfirm.isOpen}
            onClose={() => setComingSoonConfirm({ isOpen: false, feature: "" })}
            onConfirm={() =>
              setComingSoonConfirm({ isOpen: false, feature: "" })
            }
            title={
              comingSoonConfirm.feature
                ? `${comingSoonConfirm.feature} — Coming Soon`
                : "Coming Soon"
            }
            message={`This feature is coming soon. We'll notify you when ${
              comingSoonConfirm.feature || "it"
            } is available.`}
            confirmText="Got it"
            cancelText=""
            danger={false}
          />
        </>
      )}

      {/* Quiz Component */}
      <AnimatePresence>
        {showQuiz && (
          <Suspense fallback={null}>
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
          <Suspense fallback={null}>
            <FlashcardsComponent
              isOpen={showFlashcards}
              onClose={() => {
                setShowFlashcards(false);
                // Remove flashcards parameter from URL
                const params = new URLSearchParams(searchParams);
                params.delete("flashcards");
                setSearchParams(params, { replace: true });
              }}
              classData={{ ...classData, files }}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ClassDetails;
