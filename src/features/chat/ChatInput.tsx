import {
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import ConfirmDialog from "@shared/components/ConfirmDialog";
import type { UploadedFile } from "@shared/services/aiService";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Key for storing draft message in localStorage
const DRAFT_MESSAGE_KEY = "lumiAI_draft_message";

// Shared round action button (upload / tag / send all share this look).
const ROUND_BTN =
  "flex h-[46px] w-[46px] flex-[0_0_46px] items-center justify-center rounded-full border-[1.5px] border-solid border-ink bg-sage text-ink shadow-[0px_2px_0_#000] transition-all duration-200 hover:-translate-y-1 active:translate-y-0 max-md:h-10 max-md:w-10 max-md:flex-[0_0_40px] max-md:p-0";
const STOP_BTN =
  "flex h-[46px] w-[46px] flex-[0_0_46px] items-center justify-center rounded-full border-[1.5px] border-solid border-[#DC2626] bg-[#FEE2E2] text-[#DC2626] shadow-[0px_2px_0_#DC2626] transition-all duration-200 hover:-translate-y-1 active:translate-y-0 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0 max-md:h-10 max-md:w-10 max-md:flex-[0_0_40px] max-md:rounded-lg max-md:p-0 max-md:[&_svg]:h-[18px] max-md:[&_svg]:w-[18px]";

interface LocalUploadedFile extends UploadedFile {
  file: File;
  size: number;
}

interface ChatInputProps {
  onSendMessage: (message: string, files: LocalUploadedFile[]) => void;
  loading?: boolean;
  onShowTagSelector?: () => void;
  onStopGeneration?: () => void;
  isGenerating?: boolean;
  onUploadFiles?: ((files: LocalUploadedFile[]) => void) | null;
}

interface FileSizeError {
  isOpen: boolean;
  message: string;
}

const ChatInput = ({
  onSendMessage,
  loading,
  onShowTagSelector,
  onStopGeneration,
  isGenerating = false,
  onUploadFiles = null,
}: ChatInputProps) => {
  const [message, setMessage] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<LocalUploadedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileSizeError, setFileSizeError] = useState<FileSizeError>({
    isOpen: false,
    message: "",
  });

  // Load saved draft when component mounts
  useEffect(() => {
    const savedMessage = localStorage.getItem(DRAFT_MESSAGE_KEY);
    if (savedMessage) {
      setMessage(savedMessage);
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "24px";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = scrollHeight + "px";
    }
  }, [message]);

  // Save draft message whenever it changes
  useEffect(() => {
    // Only save non-empty messages
    if (message.trim()) {
      localStorage.setItem(DRAFT_MESSAGE_KEY, message);
    } else {
      localStorage.removeItem(DRAFT_MESSAGE_KEY);
    }
  }, [message]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  const handleSubmit = (e: FormEvent | KeyboardEvent) => {
    e.preventDefault();

    if ((message.trim() || uploadedFiles.length > 0) && !loading) {
      onSendMessage(message, uploadedFiles);
      setMessage("");
      setUploadedFiles([]);

      // Clear the saved draft after sending
      localStorage.removeItem(DRAFT_MESSAGE_KEY);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "24px";
      }
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Extract text from PDF files
  const extractPdfText = async (file: File): Promise<string | null> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      // Extract text from all pages
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ");
        fullText += pageText + "\n\n";
      }

      return fullText.trim();
    } catch (error) {
      console.error("Error extracting PDF text:", error);
      return null;
    }
  };

  // Extract text from text files
  const extractTextFile = async (file: File): Promise<string | null> => {
    try {
      return await file.text();
    } catch (error) {
      console.error("Error reading text file:", error);
      return null;
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length === 0) return;

    // File size limits (in bytes)
    const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB for images
    const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB for documents

    const validFiles: LocalUploadedFile[] = [];
    let errorMessage = "";

    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE;
      const maxSizeMB = isImage ? 20 : 50;

      if (file.size > maxSize) {
        errorMessage = `File "${
          file.name
        }" is too large. Maximum size is ${maxSizeMB}MB for ${
          isImage ? "images" : "documents"
        }.`;
        break;
      }

      // Convert file to base64 for images (for vision API)
      if (isImage) {
        const reader = new FileReader();
        const base64Promise = new Promise<LocalUploadedFile>((resolve) => {
          reader.onload = (e: ProgressEvent<FileReader>) => {
            resolve({
              file,
              type: file.type,
              name: file.name,
              size: file.size,
              base64: e.target?.result as string,
            });
          };
          reader.readAsDataURL(file);
        });
        validFiles.push(await base64Promise);
      } else {
        // Extract text from documents
        let extractedText: string | null = null;

        if (file.type === "application/pdf") {
          extractedText = await extractPdfText(file);
        } else if (file.type === "text/plain") {
          extractedText = await extractTextFile(file);
        }

        validFiles.push({
          file,
          type: file.type,
          name: file.name,
          size: file.size,
          text: extractedText, // Store extracted text
        });
      }
    }

    if (errorMessage) {
      setFileSizeError({
        isOpen: true,
        message: errorMessage,
      });
    } else if (validFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...validFiles]);
      // Also notify parent component to show in unified ContextTags
      if (onUploadFiles) {
        onUploadFiles(validFiles);
      }
    }

    // Reset input
    (e.target as any).value = null;
  };

  return (
    <div className="w-full bg-cream p-5 max-md:px-0 max-md:py-2">
      <form
        onSubmit={handleSubmit}
        className="relative flex items-end gap-3 max-md:items-center max-md:gap-2"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.ppt,.pptx"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        <button
          type="button"
          className={ROUND_BTN}
          onClick={openFilePicker}
          title="Upload files"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          className="peer min-h-[24px] max-h-[150px] min-w-0 flex-1 resize-none overflow-y-auto rounded-[20px] border-[1.5px] border-solid border-ink bg-white px-4 py-3 text-[16px] leading-[1.5] shadow-[0px_2px_0_#000] [transition:all_200ms_cubic-bezier(.2,.8,.2,1)] focus:outline-none max-md:px-3 max-md:py-2.5 max-md:text-[15px]"
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyPress}
          placeholder="Ask a question..."
          disabled={loading && !isGenerating}
        />

        <button
          type="button"
          className={ROUND_BTN}
          onClick={onShowTagSelector}
          title="Select context"
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
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path>
            <path d="M7 7h.01"></path>
          </svg>
        </button>

        {isGenerating ? (
          <button type="button" className={STOP_BTN} onClick={onStopGeneration}>
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
              <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            className={`${ROUND_BTN} overflow-hidden peer-placeholder-shown:opacity-70`}
            disabled={isGenerating}
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-black/10 border-t-ink"></div>
            ) : (
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
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            )}
          </button>
        )}
      </form>

      {/* File size error dialog */}
      <ConfirmDialog
        isOpen={fileSizeError.isOpen}
        onClose={() => setFileSizeError({ isOpen: false, message: "" })}
        onConfirm={() => setFileSizeError({ isOpen: false, message: "" })}
        title="File Too Large"
        message={fileSizeError.message}
        confirmText="Got it"
        cancelText=""
        danger={false}
      />
    </div>
  );
};

export default ChatInput;
