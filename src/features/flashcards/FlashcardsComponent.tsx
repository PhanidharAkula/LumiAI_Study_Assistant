import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@shared/lib/supabaseClient";
import { fetchStreamingResponse } from "@shared/services/aiService";
import { getFilePublicUrl } from "@shared/utils/storageUtils";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import ConfirmDialog from "@shared/components/ConfirmDialog";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface ClassFile {
  id: string;
  name: string;
  path?: string;
  file_path?: string;
  [key: string]: any;
}

interface ClassData {
  id: string;
  name?: string;
  files?: ClassFile[];
  [key: string]: any;
}

interface Flashcard {
  id: number;
  front: string;
  back: string;
  category?: string;
  srs?: any;
  [key: string]: any;
}

interface FlashcardHistoryItem {
  id: string;
  cards: Flashcard[];
  num_cards: number;
  card_style: string;
  source_files?: string[];
  created_at: string;
  [key: string]: any;
}

type CardStyle = "standard" | "definition" | "qa";
type FlashcardStateType = "setup" | "studying" | "completed";
type StudyModeType = "all" | "unknown";

interface ErrorDialogState {
  isOpen: boolean;
  title: string;
  message: string;
}

interface DeleteConfirmDialogState {
  isOpen: boolean;
  deckId: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classData: ClassData;
}

// Tailwind class groups — 1:1 port of FlashcardsComponent.css, kept here so the
// long utility strings aren't repeated across the config cards, buttons & badges.
const CONFIG_CARD =
  "bg-white border-[1.5px] border-solid border-ink rounded-[15px] p-5 shadow-[0px_2px_0_#000] h-full";
const CONFIG_CARD_HEADER = "flex items-center gap-3 mb-[15px]";
const CONFIG_ICON =
  "w-10 h-10 rounded-[10px] flex items-center justify-center border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000]";

const STYLE_BTN_BASE =
  "flex items-center gap-3 py-3 px-4 border-[1.5px] border-solid border-ink rounded-xl cursor-pointer shadow-[0px_2px_0_#000] disabled:opacity-50 disabled:cursor-not-allowed";
const styleBtn = (active: boolean) =>
  `${STYLE_BTN_BASE} ${active ? "bg-sage" : "bg-white"}`;

const NUMBER_BTN_BASE =
  "flex flex-col items-center justify-center py-[15px] px-2.5 border-[1.5px] border-solid border-ink rounded-xl cursor-pointer shadow-[0px_2px_0_#000] gap-1 disabled:opacity-50 disabled:cursor-not-allowed";
const numberBtn = (active: boolean) =>
  `${NUMBER_BTN_BASE} ${active ? "bg-sage" : "bg-white"}`;

const META_BADGE_BASE =
  "flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[12px] font-semibold border-[1.5px] border-solid";

const CONTROL_BTN =
  "flex items-center gap-2 py-3 px-6 rounded-[100px] border-[1.5px] border-solid border-ink bg-white shadow-[0px_2px_0_#000] cursor-pointer text-[14px] font-semibold text-ink disabled:opacity-40 disabled:cursor-not-allowed max-md:py-2.5 max-md:px-4 max-md:text-[13px] max-[480px]:py-2.5 max-[480px]:px-3";
const ACTION_BTN_BASE =
  "flex items-center gap-2 py-3.5 px-7 rounded-[100px] border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] cursor-pointer text-[14px] font-semibold max-md:py-3 max-md:px-5 max-md:text-[13px] max-[480px]:w-full max-[480px]:justify-center";
const STAT_ITEM_BASE =
  "flex items-center gap-2 py-2.5 px-5 rounded-[100px] text-[14px] font-semibold max-[480px]:py-2 max-[480px]:px-4 max-[480px]:text-[13px]";
const COMPLETED_BTN_BASE =
  "flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-[100px] border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] cursor-pointer text-[14px] font-semibold";
const COMPLETED_STAT_BASE =
  "flex flex-col items-center py-5 px-[30px] rounded-2xl border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] max-md:py-[15px] max-md:px-5 max-[480px]:py-3 max-[480px]:px-4 max-[480px]:min-w-20";

const FLASHCARD_FACE =
  "absolute w-full h-full [backface-visibility:hidden] [-webkit-backface-visibility:hidden] flex flex-col justify-center items-center p-10 rounded-3xl border-[1.5px] border-solid border-ink shadow-[0px_4px_0_#000] text-center max-[480px]:py-[30px] max-[480px]:px-5";
const FLASHCARD_LABEL =
  "absolute top-5 left-5 py-1.5 px-4 bg-white border-[1.5px] border-solid border-ink rounded-[100px] text-[12px] font-semibold text-ink max-[480px]:top-3 max-[480px]:left-3 max-[480px]:py-1 max-[480px]:px-3 max-[480px]:text-[11px]";
const FLASHCARD_CONTENT =
  "text-[24px] font-medium text-ink leading-[1.5] max-h-[200px] overflow-y-auto max-md:text-[20px] max-[480px]:text-[18px]";

const FlashcardsComponent = ({ isOpen, onClose, classData }: Props) => {
  // Flashcard configuration
  const [numCards, setNumCards] = useState(10);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [cardStyle, setCardStyle] = useState<CardStyle>("standard"); // standard, definition, qa

  // Flashcard state
  const [flashcardState, setFlashcardState] =
    useState<FlashcardStateType>("setup"); // setup, studying, completed
  const [currentDeck, setCurrentDeck] = useState<Flashcard[] | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [, setLoading] = useState(false);
  const [generatingCards, setGeneratingCards] = useState(false);

  // Card progress tracking
  const [knownCards, setKnownCards] = useState<number[]>([]);
  const [unknownCards, setUnknownCards] = useState<number[]>([]);
  const [studyMode, setStudyMode] = useState<StudyModeType>("all"); // all, unknown

  // History
  const [flashcardHistory, setFlashcardHistory] = useState<
    FlashcardHistoryItem[]
  >([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  // Error dialog
  const [errorDialog, setErrorDialog] = useState<ErrorDialogState>({
    isOpen: false,
    title: "",
    message: "",
  });

  // Delete confirmation
  const [deleteConfirmDialog, setDeleteConfirmDialog] =
    useState<DeleteConfirmDialogState>({
      isOpen: false,
      deckId: null,
    });

  useEffect(() => {
    if (isOpen && classData) {
      loadFlashcardHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, classData]);

  // Prevent background scroll when component is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;

      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.width = "";
      };
    }
  }, [isOpen]);

  const loadFlashcardHistory = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("flashcard_history")
        .select("*")
        .eq("user_id", user.id)
        .eq("class_id", classData.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        setFlashcardHistory(data);
      }
    } catch (error) {
      console.error("Error loading flashcard history:", error);
    }
  };

  const extractFileContent = async (file: ClassFile) => {
    try {
      const { url, error } = await getFilePublicUrl(
        "files",
        (file.path || file.file_path) as string
      );
      if (!url || error) {
        console.error(`Could not get URL for ${file.name}:`, error);
        return null;
      }

      // Handle PDF files
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const resp = await fetch(url);
        if (!resp.ok) {
          console.error(`PDF fetch failed: HTTP ${resp.status}`);
          return null;
        }

        const arrayBuffer = await resp.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        let fullText = "";
        const maxPages = Math.min(pdf.numPages, 30);

        for (let p = 1; p <= maxPages; p++) {
          try {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const strings = content.items
              .map((it: any) => it.str)
              .join(" ");
            fullText += strings + "\n\n";

            if (fullText.length > 50000) break;
          } catch (pageErr) {
            console.warn(`Error extracting page ${p}:`, pageErr);
            break;
          }
        }

        const extractedText = fullText.slice(0, 50000).trim();
        return extractedText.length > 0 ? extractedText : null;
      }

      // Handle text files
      if (file.name.toLowerCase().endsWith(".txt")) {
        const resp = await fetch(url);
        if (!resp.ok) {
          console.error(`Text file fetch failed: HTTP ${resp.status}`);
          return null;
        }
        const text = await resp.text();
        return text.slice(0, 50000).trim();
      }

      console.warn(`Unsupported file type: ${file.name}`);
      return null;
    } catch (error) {
      console.error(`Error extracting file content:`, error);
      return null;
    }
  };

  const handleBackButton = () => {
    if (flashcardState === "studying" || flashcardState === "completed") {
      setFlashcardState("setup");
      setCurrentDeck(null);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setKnownCards([]);
      setUnknownCards([]);
      setStudyMode("all");
    } else {
      onClose();
    }
  };

  const handleGenerateFlashcards = async () => {
    if (selectedFiles.length === 0) {
      setErrorDialog({
        isOpen: true,
        title: "No Files Selected",
        message: "Please select at least one file to generate flashcards from.",
      });
      return;
    }

    setGeneratingCards(true);
    setLoading(true);

    try {
      // Build context from selected files
      const fileContents = await Promise.all(
        selectedFiles.map(async (fileId) => {
          const file = classData.files?.find(
            (f: ClassFile) => f.id === fileId
          );
          if (!file) return null;

          const content = await extractFileContent(file);
          if (!content) return null;

          return {
            name: file.name,
            content: content,
          };
        })
      );

      const validContents = fileContents.filter(Boolean) as {
        name: string;
        content: string;
      }[];

      if (validContents.length === 0) {
        const errorMessage =
          "Could not extract content from the selected files. This could be because:\n\n" +
          "• PDF files are image-based (scanned documents without text)\n" +
          "• Files are empty or corrupted\n" +
          "• Image files are not supported for flashcard generation\n\n" +
          "Please try:\n" +
          "1. Selecting different files (PDF or TXT)\n" +
          "2. Ensuring PDFs contain actual text (not just images)";

        setErrorDialog({
          isOpen: true,
          title: "Unsupported File Format",
          message: errorMessage,
        });
        setGeneratingCards(false);
        setLoading(false);
        return;
      }

      const filesContext = validContents
        .map((f) => `=== ${f.name} ===\n${f.content}`)
        .join("\n\n");

      const styleInstructions = {
        standard:
          "Create flashcards with a term/concept on the front and explanation on the back.",
        definition:
          "Create flashcards with a term on the front and its definition on the back.",
        qa: "Create flashcards with a question on the front and the answer on the back.",
      };

      const prompt = `You are an expert flashcard creator. Create exactly ${numCards} high-quality flashcards based on the following educational content.

CONTENT TO BASE FLASHCARDS ON:
${filesContext}

FLASHCARD STYLE: ${cardStyle.toUpperCase()}
${styleInstructions[cardStyle]}

FLASHCARD REQUIREMENTS:
1. Generate exactly ${numCards} flashcards
2. Each card should focus on ONE key concept
3. Front side should be concise and clear
4. Back side should be comprehensive but not too long
5. Cover the most important topics from the content
6. Make cards progressively more challenging

RESPONSE FORMAT (JSON only, no markdown):
{
  "cards": [
    {
      "id": 1,
      "front": "What is the main concept?",
      "back": "The main concept is...",
      "category": "Optional category/topic"
    }
  ]
}

CRITICAL JSON FORMATTING RULES:
- All text strings MUST be properly escaped
- Use double quotes for strings, not single quotes
- Escape special characters: newlines as \\n, quotes as \\"
- Do not include any text before or after the JSON
- Do not use markdown code blocks
- Return ONLY valid JSON that can be parsed directly`;

      let flashcardData = "";

      const aiResult = await fetchStreamingResponse(
        prompt,
        "",
        (chunk: string) => {
          flashcardData += chunk;
        },
        null as unknown as AbortSignal | undefined,
        [],
        []
      );

      // If the AI call failed, show the friendly message rather than a
      // misleading "couldn't parse the flashcards" content error.
      if (aiResult?.error && aiResult.errorType !== "aborted") {
        setErrorDialog({
          isOpen: true,
          title: "Couldn't generate flashcards",
          message: aiResult.error,
        });
        setGeneratingCards(false);
        setLoading(false);
        return;
      }

      // Parse the flashcard data
      let parsedData;
      try {
        // Clean up the response
        let cleanedData = flashcardData.trim();

        // Remove markdown code blocks if present
        if (cleanedData.startsWith("```json")) {
          cleanedData = cleanedData.slice(7);
        } else if (cleanedData.startsWith("```")) {
          cleanedData = cleanedData.slice(3);
        }
        if (cleanedData.endsWith("```")) {
          cleanedData = cleanedData.slice(0, -3);
        }
        cleanedData = cleanedData.trim();

        parsedData = JSON.parse(cleanedData);
      } catch (parseError) {
        console.error("Parse error:", parseError);
        setErrorDialog({
          isOpen: true,
          title: "Generation Error",
          message:
            "Failed to parse the generated flashcards. Please try again.",
        });
        setGeneratingCards(false);
        setLoading(false);
        return;
      }

      if (!parsedData.cards || parsedData.cards.length === 0) {
        setErrorDialog({
          isOpen: true,
          title: "No Cards Generated",
          message:
            "The AI couldn't generate flashcards from the content. Please try with different files.",
        });
        setGeneratingCards(false);
        setLoading(false);
        return;
      }

      // Save to history
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const selectedFileNames = selectedFiles
          .map(
            (id) => classData.files?.find((f: ClassFile) => f.id === id)?.name
          )
          .filter(Boolean);

        await supabase.from("flashcard_history").insert({
          user_id: user.id,
          class_id: classData.id,
          cards: parsedData.cards,
          num_cards: parsedData.cards.length,
          card_style: cardStyle,
          source_files: selectedFileNames,
        });

        loadFlashcardHistory();
      }

      setCurrentDeck(parsedData.cards);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setKnownCards([]);
      setUnknownCards([]);
      setFlashcardState("studying");
    } catch (error) {
      console.error("Error generating flashcards:", error);
      setErrorDialog({
        isOpen: true,
        title: "Generation Failed",
        message:
          "An error occurred while generating flashcards. Please try again.",
      });
    } finally {
      setGeneratingCards(false);
      setLoading(false);
    }
  };

  const handleFlipCard = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNextCard = () => {
    if (currentCardIndex < getActiveCards().length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setIsFlipped(false);
    } else {
      // End of deck
      setFlashcardState("completed");
    }
  };

  const handlePrevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setIsFlipped(false);
    }
  };

  const handleMarkKnown = () => {
    const currentCard = getActiveCards()[currentCardIndex];
    if (currentCard && !knownCards.includes(currentCard.id)) {
      setKnownCards([...knownCards, currentCard.id]);
      setUnknownCards(unknownCards.filter((id) => id !== currentCard.id));
    }
    handleNextCard();
  };

  const handleMarkUnknown = () => {
    const currentCard = getActiveCards()[currentCardIndex];
    if (currentCard && !unknownCards.includes(currentCard.id)) {
      setUnknownCards([...unknownCards, currentCard.id]);
      setKnownCards(knownCards.filter((id) => id !== currentCard.id));
    }
    handleNextCard();
  };

  const getActiveCards = () => {
    if (!currentDeck) return [];
    if (studyMode === "unknown") {
      return currentDeck.filter((card: Flashcard) =>
        unknownCards.includes(card.id)
      );
    }
    return currentDeck;
  };

  const handleStudyUnknown = () => {
    if (unknownCards.length > 0) {
      setStudyMode("unknown");
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setFlashcardState("studying");
    }
  };

  const handleRestartDeck = () => {
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setKnownCards([]);
    setUnknownCards([]);
    setStudyMode("all");
    setFlashcardState("studying");
  };

  const handleLoadFromHistory = (historyItem: FlashcardHistoryItem) => {
    setCurrentDeck(historyItem.cards);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setKnownCards([]);
    setUnknownCards([]);
    setStudyMode("all");
    setShowHistoryDropdown(false);
    setFlashcardState("studying");
  };

  const handleDeleteHistory = async (deckId: string | null) => {
    try {
      await supabase.from("flashcard_history").delete().eq("id", deckId);
      loadFlashcardHistory();
      setDeleteConfirmDialog({ isOpen: false, deckId: null });
    } catch (error) {
      console.error("Error deleting flashcard history:", error);
    }
  };

  const toggleFileSelection = (fileId: string) => {
    if (selectedFiles.includes(fileId)) {
      setSelectedFiles(selectedFiles.filter((id) => id !== fileId));
    } else {
      setSelectedFiles([...selectedFiles, fileId]);
    }
  };

  const selectAllFiles = () => {
    if (classData?.files) {
      const supportedFiles = classData.files.filter(
        (f: ClassFile) =>
          f.name.toLowerCase().endsWith(".pdf") ||
          f.name.toLowerCase().endsWith(".txt")
      );
      setSelectedFiles(supportedFiles.map((f: ClassFile) => f.id));
    }
  };

  const deselectAllFiles = () => {
    setSelectedFiles([]);
  };

  if (!isOpen) return null;

  const currentCard = getActiveCards()[currentCardIndex];
  const progress = currentDeck
    ? ((currentCardIndex + 1) / getActiveCards().length) * 100
    : 0;

  return (
    <motion.div
      className="fixed inset-0 bg-transparent z-[1000] flex flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Header */}
      <div className="py-5 px-[30px] flex items-center gap-5 relative z-[100] max-md:py-[15px] max-md:px-5 max-md:gap-[15px]">
        <motion.button
          className="h-[50px] w-[50px] rounded-full flex justify-center items-center bg-sage shadow-[0px_2px_0_#000] border-[1.5px] border-solid border-ink text-[xx-large] cursor-pointer p-2.5 max-md:w-11 max-md:h-11"
          onClick={handleBackButton}
          whileTap={{ scale: 0.95 }}
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
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </motion.button>

        <div className="flex-1 flex items-center">
          <div>
            <h1 className="m-0 text-[x-large] font-semibold text-ink max-md:text-[large]">
              Flashcards
            </h1>
            <p className="mt-1 mb-0 mx-0 text-[small] text-muted">
              {classData?.name}
            </p>
          </div>
        </div>

        {/* History Dropdown */}
        <div className="relative">
          <motion.button
            className="flex items-center gap-2 py-2.5 px-4 rounded-[100px] bg-sage border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] cursor-pointer text-ink font-medium text-[14px]"
            onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
            whileTap={{ scale: 0.95 }}
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
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span className="font-semibold max-md:hidden">History</span>
            {flashcardHistory.length > 0 && (
              <span className="min-w-5 h-5 px-1.5 flex items-center justify-center bg-[#8b5cf6] text-white text-[11px] font-bold rounded-[10px]">
                {flashcardHistory.length}
              </span>
            )}
          </motion.button>

          <AnimatePresence>
            {showHistoryDropdown && (
              <>
                <div
                  className="fixed inset-0 bg-transparent z-[999]"
                  onClick={() => setShowHistoryDropdown(false)}
                />
                <motion.div
                  className="absolute top-[calc(100%+10px)] right-0 w-[420px] max-h-[80dvh] bg-white border-[1.5px] border-solid border-ink rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.15)] z-[1000] overflow-hidden flex flex-col max-md:w-[320px] max-md:right-[-10px]"
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="p-5 bg-[#f3e8ff] border-0 border-b-[1.5px] border-solid border-ink flex items-center justify-between">
                    <h3 className="m-0 text-[large] font-semibold text-ink">
                      Flashcard History
                    </h3>
                    <span className="py-1.5 px-3 bg-sage text-ink text-[14px] font-semibold rounded-lg border-[1.5px] border-solid border-ink">
                      {flashcardHistory.length} decks
                    </span>
                  </div>
                  <div className="p-4 overflow-y-auto max-h-[calc(80dvh-100px)] flex flex-col gap-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {flashcardHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-[60px] px-[30px] text-center gap-3">
                        <div className="w-20 h-20 rounded-full bg-[linear-gradient(135deg,#f3e8ff_0%,#e9d5ff_100%)] flex items-center justify-center mb-2 text-[#8b5cf6] opacity-60">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect
                              x="2"
                              y="3"
                              width="20"
                              height="14"
                              rx="2"
                              ry="2"
                            ></rect>
                            <line x1="8" y1="21" x2="16" y2="21"></line>
                            <line x1="12" y1="17" x2="12" y2="21"></line>
                          </svg>
                        </div>
                        <p className="m-0 text-[16px] font-semibold text-ink">
                          No flashcard decks yet
                        </p>
                        <span className="text-[13px] text-muted">
                          Generate your first deck to get started
                        </span>
                      </div>
                    ) : (
                      flashcardHistory.map((item) => (
                        <motion.div
                          key={item.id}
                          className="bg-white border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] rounded-[15px] p-[15px] cursor-pointer"
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                        >
                          <div className="flex justify-between items-center mb-[15px]">
                            <div className="flex items-center gap-1.5 py-1.5 px-3 bg-[#f3f4f6] rounded-lg text-[12px] font-semibold text-muted">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <rect
                                  x="3"
                                  y="4"
                                  width="18"
                                  height="18"
                                  rx="2"
                                  ry="2"
                                ></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                              </svg>
                              {new Date(item.created_at).toLocaleDateString()}
                            </div>
                            <button
                              className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#fee2e2] border-[1.5px] border-solid border-[#ef4444] cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmDialog({
                                  isOpen: true,
                                  deckId: item.id,
                                });
                              }}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#ef4444"
                                strokeWidth="2"
                              >
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </div>

                          <div className="flex gap-2 mb-2.5 flex-wrap">
                            <span
                              className={`${META_BADGE_BASE} bg-[#f3e8ff] border-[#8b5cf6] text-[#7c3aed]`}
                            >
                              <span className="text-[14px]">📇</span>
                              {item.num_cards} cards
                            </span>
                            <span
                              className={`${META_BADGE_BASE} bg-[#fef3c7] border-[#f59e0b] text-[#d97706]`}
                            >
                              <span className="text-[14px]">✨</span>
                              {item.card_style}
                            </span>
                          </div>

                          {item.source_files &&
                            item.source_files.length > 0 && (
                              <div className="flex items-start gap-2 p-2.5 bg-[#f3f4f6] rounded-lg text-[11px] text-muted leading-[1.4] mb-3 [&_svg]:shrink-0">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                  <polyline points="14 2 14 8 20 8"></polyline>
                                </svg>
                                <span>{item.source_files.join(", ")}</span>
                              </div>
                            )}

                          <motion.button
                            className="w-full p-3 rounded-[10px] bg-sage border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] text-ink font-semibold text-[14px] cursor-pointer"
                            onClick={() => handleLoadFromHistory(item)}
                            whileTap={{ scale: 0.95 }}
                          >
                            Study This Deck
                          </motion.button>
                        </motion.div>
                      ))
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Content Area — flex:1 + min-h-0 scroll region; children use m-auto to
          center vertically when they fit, collapsing to 0 (scroll from top) when taller. */}
      <div className="flex-1 min-h-0 overflow-y-auto [-webkit-overflow-scrolling:touch] p-5 bg-transparent flex flex-col max-[480px]:p-2.5">
        <AnimatePresence mode="wait">
          {/* Setup State */}
          {flashcardState === "setup" && (
            <motion.div
              key="setup"
              className="w-full max-w-[1400px] m-auto flex flex-col gap-5 p-0 h-auto justify-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Config Grid */}
              <div className="grid grid-cols-3 grid-rows-[1fr_1fr] gap-[15px] items-stretch mb-5 flex-1 max-[1200px]:grid-cols-2 max-[1200px]:grid-rows-[auto] max-md:grid-cols-1">
                {/* Setup Header */}
                <div className="text-center py-[30px] px-5 bg-[#f3e8ff] rounded-[20px] border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] relative overflow-hidden col-[1/3] row-[1] flex flex-col justify-center items-center max-[1200px]:col-[1/-1] max-md:col-[1] max-md:row-[auto] before:content-[''] before:absolute before:top-[-50%] before:right-[-50%] before:w-[200%] before:h-[200%] before:bg-[radial-gradient(circle,rgba(255,255,255,0.3)_0%,transparent_70%)] before:pointer-events-none">
                  <div className="w-[70px] h-[70px] mt-0 mx-auto mb-5 bg-white rounded-full flex items-center justify-center border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] text-ink">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect
                        x="2"
                        y="3"
                        width="20"
                        height="14"
                        rx="2"
                        ry="2"
                      ></rect>
                      <line x1="8" y1="21" x2="16" y2="21"></line>
                      <line x1="12" y1="17" x2="12" y2="21"></line>
                    </svg>
                  </div>
                  <h2 className="mt-0 mx-0 mb-2.5 text-[x-large] font-semibold text-ink">
                    Create Flashcards
                  </h2>
                  <p className="m-0 text-[medium] text-muted">
                    Generate AI-powered flashcards from your study materials
                  </p>
                </div>
                {/* Card Style */}
                <div className={`${CONFIG_CARD} col-[1] row-[2] max-[1200px]:col-[1] max-[1200px]:row-[auto] max-md:col-[1] max-md:row-[auto]`}>
                  <div className={CONFIG_CARD_HEADER}>
                    <div className={`${CONFIG_ICON} bg-[#fde68a] text-[#d97706]`}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                      </svg>
                    </div>
                    <h3 className="m-0 text-[16px] font-semibold text-ink">
                      Card Style
                    </h3>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <button
                      className={styleBtn(cardStyle === "standard")}
                      onClick={() => setCardStyle("standard")}
                      disabled={generatingCards}
                    >
                      <span className="text-[20px] shrink-0">📝</span>
                      <span className="flex-1 text-[14px] font-medium text-ink text-left">
                        Standard
                      </span>
                      <span className="text-[12px] text-muted bg-black/[0.08] py-[3px] px-2 rounded-full">
                        Concept & Explanation
                      </span>
                    </button>
                    <button
                      className={styleBtn(cardStyle === "definition")}
                      onClick={() => setCardStyle("definition")}
                      disabled={generatingCards}
                    >
                      <span className="text-[20px] shrink-0">📖</span>
                      <span className="flex-1 text-[14px] font-medium text-ink text-left">
                        Definition
                      </span>
                      <span className="text-[12px] text-muted bg-black/[0.08] py-[3px] px-2 rounded-full">
                        Term & Definition
                      </span>
                    </button>
                    <button
                      className={styleBtn(cardStyle === "qa")}
                      onClick={() => setCardStyle("qa")}
                      disabled={generatingCards}
                    >
                      <span className="text-[20px] shrink-0">❓</span>
                      <span className="flex-1 text-[14px] font-medium text-ink text-left">
                        Q&A
                      </span>
                      <span className="text-[12px] text-muted bg-black/[0.08] py-[3px] px-2 rounded-full">
                        Question & Answer
                      </span>
                    </button>
                  </div>
                </div>

                {/* Number of Cards */}
                <div className={`${CONFIG_CARD} col-[2] row-[2] max-[1200px]:col-[2] max-[1200px]:row-[auto] max-md:col-[1] max-md:row-[auto]`}>
                  <div className={CONFIG_CARD_HEADER}>
                    <div className={`${CONFIG_ICON} bg-[#e9d5ff] text-[#7c3aed]`}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="4" y1="9" x2="20" y2="9"></line>
                        <line x1="4" y1="15" x2="20" y2="15"></line>
                        <line x1="10" y1="3" x2="8" y2="21"></line>
                        <line x1="16" y1="3" x2="14" y2="21"></line>
                      </svg>
                    </div>
                    <h3 className="m-0 text-[16px] font-semibold text-ink">
                      Number of Cards
                    </h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[5, 10, 15, 20, 25, 30].map((num) => (
                      <button
                        key={num}
                        className={numberBtn(numCards === num)}
                        onClick={() => setNumCards(num)}
                        disabled={generatingCards}
                      >
                        <span className="text-[20px] font-medium text-ink">
                          {num}
                        </span>
                        <span className="text-[10px] text-muted uppercase">
                          cards
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Files Selection */}
                <div className={`${CONFIG_CARD} col-[3] row-[1/3] flex flex-col max-[1200px]:col-[1/-1] max-[1200px]:row-[auto] max-md:col-[1] max-md:row-[auto]`}>
                  <div className={CONFIG_CARD_HEADER}>
                    <div className={`${CONFIG_ICON} bg-[#a7f3d0] text-[#059669]`}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                    </div>
                    <div className="flex-1 flex justify-between items-center">
                      <h3 className="m-0 text-[16px] font-semibold text-ink">
                        Source Files
                      </h3>
                      <span className="text-[13px] font-semibold text-ink bg-sage py-1 px-3 rounded-full border-[1.5px] border-solid border-ink">
                        {selectedFiles.length} selected
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <button
                      className="py-1.5 px-3 rounded-lg border-[1.5px] border-solid border-ink bg-white text-[12px] font-semibold cursor-pointer text-ink hover:bg-sage"
                      onClick={selectAllFiles}
                      disabled={generatingCards}
                    >
                      Select All
                    </button>
                    <button
                      className="py-1.5 px-3 rounded-lg border-[1.5px] border-solid border-ink bg-white text-[12px] font-semibold cursor-pointer text-ink hover:bg-sage"
                      onClick={deselectAllFiles}
                      disabled={generatingCards}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 auto-rows-min max-h-full overflow-y-auto p-[5px] flex-1 content-start [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-md:grid-cols-1">
                    {classData?.files?.filter(
                      (f: ClassFile) =>
                        f.name.toLowerCase().endsWith(".pdf") ||
                        f.name.toLowerCase().endsWith(".txt")
                    ).length === 0 ? (
                      <div className="col-[1/-1] flex flex-col items-center justify-center py-[60px] px-5 text-center gap-3 text-muted [&_svg]:opacity-30">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="40"
                          height="40"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <p className="m-0 text-[16px] font-semibold text-ink">
                          No supported files
                        </p>
                        <span className="text-[14px] text-muted">
                          Upload PDF or TXT files to generate flashcards
                        </span>
                      </div>
                    ) : (
                      classData?.files
                        ?.filter(
                          (f: ClassFile) =>
                            f.name.toLowerCase().endsWith(".pdf") ||
                            f.name.toLowerCase().endsWith(".txt")
                        )
                        .map((file: ClassFile) => (
                          <div
                            key={file.id}
                            className="relative flex justify-center items-center gap-2.5 py-2.5 px-3 border-[1.5px] border-solid border-ink rounded-[10px] bg-white cursor-pointer shadow-[0px_2px_0_#000]"
                            onClick={() =>
                              !generatingCards && toggleFileSelection(file.id)
                            }
                          >
                            <input
                              type="checkbox"
                              className="absolute opacity-0 pointer-events-none"
                              checked={selectedFiles.includes(file.id)}
                              onChange={() => {}}
                              disabled={generatingCards}
                            />
                            <div className="shrink-0 w-8 h-8 rounded-lg bg-sage flex items-center justify-center text-ink">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col">
                              <span className="text-[13px] font-semibold text-ink overflow-hidden text-ellipsis whitespace-nowrap">
                                {file.name}
                              </span>
                              <span className="text-[10px] text-muted uppercase font-semibold">
                                {(
                                  file.name.split(".").pop() as string
                                ).toUpperCase()}
                              </span>
                            </div>
                            <div
                              className={`shrink-0 w-5 h-5 rounded-full border-[1.5px] border-solid border-ink flex items-center justify-center text-ink ${
                                selectedFiles.includes(file.id)
                                  ? "bg-sage"
                                  : "bg-white"
                              }`}
                            >
                              {selectedFiles.includes(file.id) && (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                >
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              )}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <motion.button
                className="w-fit mx-auto flex justify-center items-center gap-2.5 cursor-pointer text-[16px] font-semibold py-[15px] px-10 rounded-[100px] bg-[#8b5cf6] border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleGenerateFlashcards}
                disabled={generatingCards || selectedFiles.length === 0}
                whileTap={{ scale: 0.95 }}
              >
                {generatingCards ? (
                  <>
                    <div className="w-5 h-5 border-2 border-solid border-white/30 rounded-full border-t-white [animation:spin_0.8s_linear_infinite]"></div>
                    Generating Flashcards...
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                      <path d="M2 17l10 5 10-5"></path>
                      <path d="M2 12l10 5 10-5"></path>
                    </svg>
                    Generate {numCards} Flashcards
                  </>
                )}
              </motion.button>
            </motion.div>
          )}

          {/* Studying State */}
          {flashcardState === "studying" && currentCard && (
            <motion.div
              key="studying"
              className="w-full max-w-[800px] m-auto flex flex-col gap-[30px] p-5 max-[480px]:p-2.5 max-[480px]:gap-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Progress Bar */}
              <div className="w-full">
                <div className="w-full h-2 bg-[#e5e7eb] rounded-[100px] overflow-hidden">
                  <motion.div
                    className="h-full bg-[linear-gradient(90deg,#8b5cf6,#a78bfa)] rounded-[100px]"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="flex justify-between items-center mt-2 text-[14px] text-muted">
                  <span>
                    Card {currentCardIndex + 1} of {getActiveCards().length}
                  </span>
                  {studyMode === "unknown" && (
                    <span className="py-1 px-3 bg-[#fef3c7] border-[1.5px] border-solid border-[#f59e0b] rounded-[100px] text-[12px] font-semibold text-[#d97706]">
                      Reviewing Unknown
                    </span>
                  )}
                </div>
              </div>

              {/* Flashcard */}
              <div
                className="[perspective:1000px] cursor-pointer w-full h-[350px] max-md:h-[300px] max-[480px]:h-[260px]"
                onClick={handleFlipCard}
              >
                <motion.div
                  className="w-full h-full relative [transform-style:preserve-3d]"
                  initial={false}
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                >
                  <div
                    className={`${FLASHCARD_FACE} bg-[linear-gradient(135deg,#f3e8ff_0%,#e9d5ff_100%)]`}
                  >
                    <div className={FLASHCARD_LABEL}>
                      {cardStyle === "qa"
                        ? "Question"
                        : cardStyle === "definition"
                        ? "Term"
                        : "Front"}
                    </div>
                    <div className={FLASHCARD_CONTENT}>{currentCard.front}</div>
                    <div className="absolute bottom-5 text-[13px] text-muted opacity-70">
                      Click to flip
                    </div>
                  </div>
                  <div
                    className={`${FLASHCARD_FACE} bg-[linear-gradient(135deg,#d1fae5_0%,#a7f3d0_100%)] [transform:rotateY(180deg)]`}
                  >
                    <div className={FLASHCARD_LABEL}>
                      {cardStyle === "qa"
                        ? "Answer"
                        : cardStyle === "definition"
                        ? "Definition"
                        : "Back"}
                    </div>
                    <div className={FLASHCARD_CONTENT}>{currentCard.back}</div>
                    {currentCard.category && (
                      <div className="absolute bottom-5 py-1.5 px-4 bg-white/80 rounded-[100px] text-[12px] font-semibold text-muted">
                        {currentCard.category}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Controls */}
              <div className="flex justify-between items-center gap-5 max-md:flex-wrap max-md:justify-center">
                <motion.button
                  className={CONTROL_BTN}
                  onClick={handlePrevCard}
                  disabled={currentCardIndex === 0}
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
                  >
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Previous
                </motion.button>

                <div className="flex gap-3 max-md:w-full max-md:justify-center max-md:order-[-1] max-[480px]:flex-col max-[480px]:gap-2.5">
                  <motion.button
                    className={`${ACTION_BTN_BASE} bg-[#fee2e2] text-[#dc2626]`}
                    onClick={handleMarkUnknown}
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
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    Still Learning
                  </motion.button>

                  <motion.button
                    className={`${ACTION_BTN_BASE} bg-[#d1fae5] text-[#059669]`}
                    onClick={handleMarkKnown}
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
                    >
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Got It!
                  </motion.button>
                </div>

                <motion.button
                  className={CONTROL_BTN}
                  onClick={handleNextCard}
                  whileTap={{ scale: 0.95 }}
                >
                  Skip
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </motion.button>
              </div>

              {/* Stats */}
              <div className="flex justify-center gap-[30px] max-[480px]:gap-[15px]">
                <div className={`${STAT_ITEM_BASE} bg-[#d1fae5] text-[#059669]`}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>{knownCards.length} Known</span>
                </div>
                <div className={`${STAT_ITEM_BASE} bg-[#fee2e2] text-[#dc2626]`}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                  <span>{unknownCards.length} Learning</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Completed State */}
          {flashcardState === "completed" && (
            <motion.div
              key="completed"
              className="w-full max-w-[600px] m-auto flex flex-col items-center gap-6 p-10 bg-white rounded-3xl border-[1.5px] border-solid border-ink shadow-[0px_4px_0_#000] text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className="w-[100px] h-[100px] rounded-full bg-[linear-gradient(135deg,#d1fae5_0%,#a7f3d0_100%)] flex items-center justify-center text-[#059669]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>

              <h2 className="m-0 text-[28px] font-semibold text-ink">
                Great Job!
              </h2>
              <p className="m-0 text-[16px] text-muted">
                You've completed this deck
              </p>

              <div className="flex gap-5 my-5 max-md:flex-wrap max-md:justify-center max-[480px]:gap-2.5">
                <div className={`${COMPLETED_STAT_BASE} bg-[#d1fae5]`}>
                  <span className="text-[32px] font-semibold text-ink max-[480px]:text-[24px]">
                    {knownCards.length}
                  </span>
                  <span className="text-[12px] font-semibold text-muted uppercase">
                    Known
                  </span>
                </div>
                <div className={`${COMPLETED_STAT_BASE} bg-[#fee2e2]`}>
                  <span className="text-[32px] font-semibold text-ink max-[480px]:text-[24px]">
                    {unknownCards.length}
                  </span>
                  <span className="text-[12px] font-semibold text-muted uppercase">
                    Still Learning
                  </span>
                </div>
                <div className={`${COMPLETED_STAT_BASE} bg-[#f3e8ff]`}>
                  <span className="text-[32px] font-semibold text-ink max-[480px]:text-[24px]">
                    {currentDeck?.length || 0}
                  </span>
                  <span className="text-[12px] font-semibold text-muted uppercase">
                    Total Cards
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3 w-full">
                {unknownCards.length > 0 && (
                  <motion.button
                    className={`${COMPLETED_BTN_BASE} bg-[#fef3c7] text-[#d97706]`}
                    onClick={handleStudyUnknown}
                    whileTap={{ scale: 0.95 }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    Review {unknownCards.length} Unknown Cards
                  </motion.button>
                )}

                <motion.button
                  className={`${COMPLETED_BTN_BASE} bg-sage text-ink`}
                  onClick={handleRestartDeck}
                  whileTap={{ scale: 0.95 }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="1 4 1 10 7 10"></polyline>
                    <polyline points="23 20 23 14 17 14"></polyline>
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                  </svg>
                  Start Over
                </motion.button>

                <motion.button
                  className={`${COMPLETED_BTN_BASE} bg-[#8b5cf6] text-white`}
                  onClick={() => {
                    setFlashcardState("setup");
                    setCurrentDeck(null);
                    setKnownCards([]);
                    setUnknownCards([]);
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Create New Deck
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error Dialog */}
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
        confirmText="OK"
        cancelText=""
        danger={false}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmDialog.isOpen}
        onClose={() => setDeleteConfirmDialog({ isOpen: false, deckId: null })}
        onConfirm={() => handleDeleteHistory(deleteConfirmDialog.deckId)}
        title="Delete Flashcard Deck"
        message="Are you sure you want to delete this flashcard deck from your history? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger={true}
      />
    </motion.div>
  );
};

export default FlashcardsComponent;
