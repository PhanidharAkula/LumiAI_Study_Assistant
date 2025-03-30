import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./FileViewer.css";

const FileViewer = ({ file, url, onClose }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const renderFileContent = () => {
    if (!file || !url) return null;

    // Handle different file types
    if (file.type?.includes("image")) {
      return (
        <div className="file-image-container">
          <img
            src={url}
            alt={file.name}
            onLoad={() => setLoading(false)}
            className="file-image"
          />
        </div>
      );
    } else if (file.type?.includes("pdf")) {
      return (
        <iframe
          src={`${url}#toolbar=0`}
          className="file-document"
          onLoad={() => setLoading(false)}
          title={file.name}
        />
      );
    } else if (file.type?.includes("text") || file.name.endsWith(".txt")) {
      return (
        <iframe
          src={url}
          className="file-document"
          onLoad={() => setLoading(false)}
          title={file.name}
        />
      );
    } else {
      return (
        <div className="file-download-container">
          <div className="file-icon-large">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="60"
              height="60"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </div>
          <p className="file-name-large">{file.name}</p>
          <p className="file-size">
            {(file.size / 1024).toFixed(1)} KB • {file.type || "Unknown type"}
          </p>
          <motion.a
            href={url}
            download={file.name}
            className="download-button"
            target="_blank"
            rel="noreferrer"
            whileHover={{
              scale: 1.05,
              y: -3,
              transition: { type: "spring", stiffness: 300, damping: 5 },
            }}
            whileTap={{ scale: 0.98 }}
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download File
          </motion.a>
        </div>
      );
    }
  };

  return (
    <motion.div
      className="file-viewer-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="file-viewer-content"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="file-viewer-header">
          <h3 className="file-viewer-title">{file?.name}</h3>
          <motion.button
            className="file-viewer-close-btn"
            onClick={onClose}
            whileHover={{
              scale: 1.1,
              transition: { type: "spring", stiffness: 400, damping: 10 },
            }}
            whileTap={{ scale: 0.9 }}
          >
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
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </motion.button>
        </div>

        <div className="file-viewer-body">
          {loading && (
            <div className="file-loading">
              <div className="spinner"></div>
              <span>Loading file...</span>
            </div>
          )}
          {renderFileContent()}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default FileViewer;
