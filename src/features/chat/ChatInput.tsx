import {
  memo,
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import ConfirmDialog from "@shared/components/ConfirmDialog";
import { IconButton } from "@shared/components/controls";
import type { UploadedFile } from "@shared/services/aiService";
import { resolveFileForAI } from "@shared/lib/fileExtract";

// Key for storing draft message in localStorage
const DRAFT_MESSAGE_KEY = "lumiAI_draft_message";

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
  /** Controlled list of attached files (owned by the parent, so removing a pill
   *  there actually removes it from what gets sent). */
  uploadedFiles?: LocalUploadedFile[];
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
  uploadedFiles = [],
}: ChatInputProps) => {
  const [message, setMessage] = useState("");
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
      // Reset to auto (not a fixed 24px, which ignored the py-2 padding and
      // popped the height) so scrollHeight reflects the true content height.
      textareaRef.current.style.height = "auto";
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
      // The parent owns the file list and clears it on send.

      // Clear the saved draft after sending
      localStorage.removeItem(DRAFT_MESSAGE_KEY);

      // Reset textarea height (auto collapses it to one line cleanly).
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
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

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    const validFiles: LocalUploadedFile[] = [];
    let errorMessage = "";

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        errorMessage = `File "${file.name}" is too large. Maximum size is 50MB.`;
        break;
      }
      // Unified resolver: text and/or vision images - identical to the tagged
      // class-file path (PDFs incl. scanned, docx/pptx, code/text, web images,
      // HEIC, and a text sniff for unknown types).
      const resolved = await resolveFileForAI(file, file.name);
      const isImageFile =
        file.type.startsWith("image/") ||
        /\.(heic|heif|png|jpe?g|gif|webp|bmp|tiff?|avif)$/i.test(file.name);
      if (isImageFile && resolved.images[0]) {
        // A single image: keep it on `base64` (normalized type) so the sent
        // message shows a thumbnail preview, not just a filename.
        validFiles.push({
          file,
          name: file.name,
          size: file.size,
          type: resolved.images[0].type,
          base64: resolved.images[0].base64,
        });
      } else {
        // Document/other: text + any rendered page images (shown as a filename).
        validFiles.push({
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          text: resolved.text || resolved.note || null,
          images: resolved.images,
        });
      }
    }

    if (errorMessage) {
      setFileSizeError({ isOpen: true, message: errorMessage });
    } else if (validFiles.length > 0 && onUploadFiles) {
      // The parent owns the file list (shown in ContextTags + sent on submit).
      onUploadFiles(validFiles);
    }

    // Reset input
    (e.target as any).value = null;
  };

  return (
    <div className="w-full p-5 pt-3 max-md:px-0 max-md:py-2">
      {/* The writing desk - one vellum plate; the plate IS the field. */}
      <form
        onSubmit={handleSubmit}
        className="relative flex items-end gap-1.5 rounded-[28px] border border-solid border-line bg-vellum p-2 shadow-plate transition-[border-color,box-shadow] duration-200 focus-within:border-ink/30 focus-within:shadow-float max-md:items-center max-md:gap-1 max-md:p-1.5"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        <IconButton
          variant="ghost"
          label="Upload files"
          onClick={openFilePicker}
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
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </IconButton>

        <IconButton
          variant="ghost"
          label="Select context"
          onClick={onShowTagSelector}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path>
            <path d="M7 7h.01"></path>
          </svg>
        </IconButton>

        <textarea
          ref={textareaRef}
          rows={1}
          className="peer max-h-37.5 min-h-6 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2.5 py-2 text-[15.5px] leading-normal text-ink outline-none placeholder:text-muted/55 max-md:px-2 max-md:py-1.5 max-md:text-[15px]"
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyPress}
          placeholder="Ask a question..."
        />

        {isGenerating ? (
          <IconButton
            variant="danger"
            label="Stop generating"
            // Soft wash at rest AND on hover (just brighten the ring + keep the
            // red glyph) - the danger variant's default hover inverts to a solid
            // red fill with a white icon, which clashed with this softened key.
            className="border-vermilion/40! bg-vermilion-wash! hover:border-vermilion! hover:bg-vermilion-wash! hover:text-vermilion!"
            onClick={onStopGeneration}
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
              aria-hidden="true"
            >
              <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
            </svg>
          </IconButton>
        ) : (
          <IconButton
            type="submit"
            variant="solid"
            label="Send"
            // Dim only when there's genuinely nothing to send. The old
            // `peer-placeholder-shown` trick keyed off the empty textarea alone,
            // so the button looked disabled even with files attached (sendable).
            className={`overflow-hidden ${
              message.trim() || uploadedFiles.length > 0 ? "" : "opacity-60"
            }`}
          >
            {loading ? (
              // In-button loading ring - a functional indicator recolored for the
              // ink surface (the gold ambient .spinner would read wrong here).
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-cream/25 border-t-cream" />
            ) : (
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
                aria-hidden="true"
              >
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            )}
          </IconButton>
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

// Memoized: during streaming the parent re-renders ~33fps; without this the
// framer Stop button re-rendered every frame and its hover gesture stuttered.
// The parent passes stable (useCallback) handlers so the memo actually holds.
export default memo(ChatInput);
