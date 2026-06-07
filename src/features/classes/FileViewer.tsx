import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface FileMeta {
  name: string;
  type?: string;
  size: number;
  [key: string]: unknown;
}

interface FileViewerProps {
  file: FileMeta | null;
  url: string | null;
  onClose: () => void;
}

const CLOSE_BTN =
  "flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-solid border-ink bg-white shadow-[0px_2px_0_#000] max-md:h-9 max-md:w-9";

const FileViewer = ({ file, url, onClose }: FileViewerProps) => {
  const [loading, setLoading] = useState(true);

  const isGenericFile = file
    ? !(
        file.type?.includes("image") ||
        file.type?.includes("pdf") ||
        file.type?.includes("text") ||
        file.name.endsWith(".txt")
      )
    : false;

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleSmallButtonDownload = async () => {
    if (!url || !file?.name) return;
    try {
      const response = await fetch(url, { mode: "cors" });
      const blob = await response.blob();
      const objectURL = URL.createObjectURL(blob);

      const tempLink = document.createElement("a");
      tempLink.href = objectURL;
      tempLink.download = file.name;

      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      URL.revokeObjectURL(objectURL);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const renderFileContent = () => {
    if (!file || !url) return null;

    if (file.type?.includes("image")) {
      return (
        <div className="flex max-h-full max-w-full items-center justify-center overflow-auto">
          <img
            src={url}
            alt={file.name}
            onLoad={() => setLoading(false)}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      );
    }

    if (file.type?.includes("pdf")) {
      return (
        <iframe
          src={`${url}#toolbar=0`}
          className="h-full w-full border-none"
          onLoad={() => setLoading(false)}
          title={file.name}
        />
      );
    }

    if (file.type?.includes("text") || file.name.endsWith(".txt")) {
      return (
        <iframe
          src={url}
          className="h-full w-full border-none"
          onLoad={() => setLoading(false)}
          title={file.name}
        />
      );
    }

    if (isGenericFile) {
      if (loading) return null;
      return (
        <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
          <div className="mb-5 flex h-[100px] w-[100px] items-center justify-center rounded-xl border-[1.5px] border-solid border-ink bg-sage shadow-[0px_2px_0_#000] max-md:h-20 max-md:w-20">
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
          <p className="my-2.5 text-[20px] font-semibold">{file.name}</p>
          <p className="mb-5 text-muted">
            {(file.size / 1024).toFixed(1)} KB • {file.type || "Unknown type"}
          </p>
          <motion.a
            href={url}
            download={file.name}
            className="flex items-center gap-2.5 rounded-full border-[1.5px] border-solid border-ink bg-sage px-[25px] py-3 text-[16px] font-semibold text-ink no-underline shadow-[0px_2px_0_#000]"
            target="_blank"
            rel="noreferrer"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
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
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-[5px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="flex h-[85dvh] w-[90%] max-w-[1000px] flex-col overflow-hidden rounded-[15px] border-[1.5px] border-solid border-ink bg-white shadow-[0_5px_20px_rgba(0,0,0,0.2)] max-md:h-[90dvh] max-md:w-[95%]"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-0 border-b border-solid border-ink bg-sage px-5 py-[15px]">
          <h3 className="m-0 max-w-[80%] overflow-hidden text-ellipsis whitespace-nowrap text-[18px] font-semibold max-md:max-w-[70%] max-md:text-[16px]">
            {file?.name}
          </h3>
          <div className="flex gap-2.5">
            {!isGenericFile && (
              <motion.button
                className={CLOSE_BTN}
                onClick={handleSmallButtonDownload}
                whileHover={{
                  scale: 1.1,
                  transition: { type: "spring", stiffness: 400, damping: 10 },
                }}
                whileTap={{ scale: 0.95 }}
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </motion.button>
            )}

            <motion.button
              className={CLOSE_BTN}
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
        </div>

        <div className="relative flex flex-1 items-center justify-center overflow-auto p-5">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80">
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
