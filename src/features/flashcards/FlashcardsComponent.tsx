import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@shared/lib/supabaseClient";
import { fetchStreamingResponse } from "@shared/services/aiService";
import ConfirmDialog from "@shared/components/ConfirmDialog";
import {
  Constellation,
  CornerTicks,
  Starfield,
  UI,
  starPath,
} from "@shared/components/atlas";
import { BackButton, Button, IconButton } from "@shared/components/controls";
import { fadeRise, pressLift, stagger } from "@shared/motion";
import { useEscapeToClose, useScrollLock } from "@shared/hooks/overlay";
import { extractFileContent } from "@features/study/extractFileContent";
import GeneratingState from "@features/study/GeneratingState";
import FileSelectionCard from "@features/study/FileSelectionCard";
import HistoryDropdown from "@features/study/HistoryDropdown";
import StudyErrorDialog, {
  type StudyErrorState,
} from "@features/study/StudyErrorDialog";

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

interface DeleteConfirmDialogState {
  isOpen: boolean;
  deckId: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classData: ClassData;
}

// Tailwind class groups - The Luminarium "deck of stars" vocabulary. Setup is
// a parchment composing desk, studying flips each card from a vellum day-plate
// to a midnight answer-plate, and completion reads like an instrument panel.
// Tailwind v4 can't resolve conflicting utilities by class order, so
// selected/tinted states are variant strings.

/* ── Setup (parchment) ─────────────────────────────────────────────────── */
const CONFIG_CARD = `${UI.plate} h-full p-5 max-md:rounded-[10px] max-md:p-4`;
const CONFIG_CARD_HEADER = "mb-4 flex items-center gap-3";
const CONFIG_H3 = `m-0 ${UI.overline}`;

const STYLE_PILL_BASE =
  "flex items-center gap-3 rounded-full border border-solid px-4 py-3 cursor-pointer transition-[color,background-color,border-color,box-shadow] duration-200 disabled:opacity-50 disabled:cursor-not-allowed max-md:py-2.5 max-md:px-3.5";
const styleBtn = (active: boolean) =>
  `${STYLE_PILL_BASE} ${
    active
      ? "border-ink bg-ink text-cream"
      : "border-ink/25 bg-transparent text-ink hover:border-ink"
  }`;

const NUMBER_BTN_BASE =
  "relative flex flex-col items-center justify-center gap-0.5 rounded-xl border border-solid py-3.75 px-2.5 cursor-pointer transition-[color,background-color,border-color,box-shadow] duration-200 disabled:opacity-50 disabled:cursor-not-allowed max-md:py-2.5 max-md:px-1.5";
const numberBtn = (active: boolean) =>
  `${NUMBER_BTN_BASE} ${
    active
      ? "border-ink bg-ink text-cream after:absolute after:right-2 after:top-1.5 after:text-[9px] after:leading-none after:text-gold after:content-['✦']"
      : "border-ink/25 bg-transparent text-ink hover:border-ink"
  }`;

/* ── History (ledger rows) ─────────────────────────────────────────────── */
const HISTORY_ROW =
  "group relative rounded-lg border border-solid border-line bg-transparent p-3.5 transition-colors duration-200 hover:border-ink/40 hover:bg-cream/60";

/* ── Studying - the two-faced atlas plate ──────────────────────────────── */
const FLASHCARD_FACE =
  "absolute w-full h-full [backface-visibility:hidden] [-webkit-backface-visibility:hidden] flex flex-col justify-center items-center p-10 rounded-xl border border-solid text-center max-[480px]:py-7.5 max-[480px]:px-5";
const FLASHCARD_FACE_FRONT = `${FLASHCARD_FACE} border-line bg-vellum shadow-plate`;
const FLASHCARD_FACE_BACK = `${FLASHCARD_FACE} overflow-hidden border-line-night bg-night text-starlight shadow-night [transform:rotateY(180deg)]`;
const FLASHCARD_LABEL =
  "absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.2em] max-[480px]:top-3 max-[480px]:text-[9px]";
const FLASHCARD_CONTENT =
  "relative font-display font-medium leading-normal max-h-50 overflow-y-auto max-md:max-h-42.5 max-[480px]:max-h-35";
const FLASHCARD_CONTENT_FRONT = `${FLASHCARD_CONTENT} text-[26px] text-ink max-md:text-[22px] max-[480px]:text-[19px]`;
const FLASHCARD_CONTENT_BACK = `${FLASHCARD_CONTENT} text-[20px] text-starlight max-md:text-[18px] max-[480px]:text-[16px]`;

// Known / Unknown verdicts - verdigris vs red-ink hairline pills, fill on hover.
const MARK_BTN_BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-solid px-6 py-3 text-[14px] font-semibold transition-colors duration-200 max-md:py-2.5 max-md:px-5 max-md:text-[13px] max-[480px]:flex-1 max-[480px]:px-3";
const MARK_UNKNOWN_BTN = `${MARK_BTN_BASE} border-vermilion/35 bg-vermilion-wash/40 text-vermilion hover:border-vermilion hover:bg-vermilion hover:text-white`;
const MARK_KNOWN_BTN = `${MARK_BTN_BASE} border-verdi/40 bg-sage/20 text-verdi hover:border-verdi hover:bg-verdi hover:text-white`;

const STUDY_STAT_BASE =
  "flex items-center gap-2 rounded-full border border-solid px-4 py-2 max-[480px]:px-3.5 max-[480px]:py-1.5";

/* ── Completed (instrument readouts) ───────────────────────────────────── */
const COMPLETED_STAT =
  "flex flex-col items-center gap-1 rounded-lg border border-solid border-line bg-cream/50 py-5 px-7.5 max-md:py-3.75 max-md:px-5 max-[480px]:py-3 max-[480px]:px-4 max-[480px]:min-w-20";
const COMPLETED_STAT_LABEL =
  "font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-muted";
const COMPLETED_STAT_VALUE =
  "font-display text-[32px] font-semibold leading-tight max-[480px]:text-[24px]";

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
  const [errorDialog, setErrorDialog] = useState<StudyErrorState>({
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

  // Lock background scroll while the deck overlay is open (shared,
  // reference-counted so nested dialogs above it don't release early).
  useScrollLock(isOpen);

  // Scroll to top when the deck phase changes to studying or completed.
  useEffect(() => {
    if (flashcardState === "studying" || flashcardState === "completed") {
      const contentArea = document.querySelector(".flashcard-content-area");
      if (contentArea) {
        contentArea.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [flashcardState]);

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

  // File text extraction lives in @features/study/extractFileContent (shared
  // with Quiz) - imported above.

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

  // Escape steps back through phases / closes - same path as the back key,
  // and stacked so a dialog above the deck pops first.
  useEscapeToClose(isOpen, handleBackButton);

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

    try {
      // Build context from selected files
      const fileContents = await Promise.all(
        selectedFiles.map(async (fileId) => {
          const file = classData.files?.find((f: ClassFile) => f.id === fileId);
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
    }
  };

  const handleCancelGeneration = () => {
    setGeneratingCards(false);
    setFlashcardState("setup");
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

  if (!isOpen) return null;

  const currentCard = getActiveCards()[currentCardIndex];
  const progress = currentDeck
    ? ((currentCardIndex + 1) / getActiveCards().length) * 100
    : 0;

  return (
    <motion.div
      className="fixed inset-0 bg-cream/95 backdrop-blur-[2px] z-1000 flex flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Header */}
      <div className="py-5 px-7.5 flex items-center gap-5 relative z-100 max-md:py-3.75 max-md:px-5 max-md:gap-3.75">
        <BackButton
          onClick={handleBackButton}
          label={
            flashcardState === "studying" || flashcardState === "completed"
              ? "Back to setup"
              : "Close flashcards"
          }
          className="shrink-0 max-md:h-9! max-md:w-9!"
        />

        <div className="flex-1 flex items-center">
          <div>
            <h1 className="m-0 font-display text-[24px] font-semibold tracking-[-0.01em] text-ink max-md:text-[16px]">
              Flashcards
            </h1>
            <p className="mt-1 mb-0 mx-0 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted max-md:text-[9px]">
              {classData?.name}
            </p>
          </div>
        </div>

        {/* History - shared dropdown; rows are feature-owned via renderItem. */}
        <HistoryDropdown
          open={showHistoryDropdown}
          onToggle={() => setShowHistoryDropdown((v) => !v)}
          onClose={() => setShowHistoryDropdown(false)}
          title="Flashcard History"
          items={flashcardHistory}
          itemKey={(item) => item.id}
          nounSingular="deck"
          nounPlural="decks"
          itemClassName={HISTORY_ROW}
          emptySeed="flashcard history"
          emptyTitle="No History Yet"
          emptyHint="Generate your first deck to get started"
          renderItem={(item) => (
            <>
              {/* Ledger line - date over mono meta, delete key on hover */}
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="font-display text-[15px] font-semibold leading-tight text-ink">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
                <IconButton
                  size="sm"
                  variant="danger"
                  label="Delete deck"
                  className="h-8! w-8! opacity-0 group-hover:opacity-100 max-md:opacity-100"
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
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </IconButton>
              </div>

              <div className="mb-2 font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted">
                {item.num_cards} cards · {item.card_style}
              </div>

              {item.source_files && item.source_files.length > 0 && (
                <div className="mb-3 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-[1.4] text-muted/80">
                  {item.source_files.join(", ")}
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => handleLoadFromHistory(item)}
              >
                Study This Deck
              </Button>
            </>
          )}
        />
      </div>

      {/* Content Area - flex:1 + min-h-0 scroll region; the flashcard-content-area
          class is a scroll-to-top querySelector hook. Children use m-auto to
          center vertically when they fit, collapsing to 0 (scroll from top) when taller. */}
      <div className="flashcard-content-area flex-1 min-h-0 overflow-y-auto [-webkit-overflow-scrolling:touch] p-5 bg-transparent flex flex-col max-[480px]:p-2.5">
        <AnimatePresence mode="wait">
          {/* Setup State */}
          {flashcardState === "setup" && !generatingCards && (
            <motion.div
              key="setup"
              className="w-full max-w-350 m-auto flex flex-col gap-5 p-0 h-auto justify-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Config Grid */}
              <motion.div
                className="grid grid-cols-3 grid-rows-[1fr_1fr] gap-3.75 items-stretch mb-5 flex-1 max-[1200px]:grid-cols-2 max-[1200px]:grid-rows-[auto] max-md:grid-cols-1"
                variants={stagger()}
                initial="hidden"
                animate="visible"
              >
                {/* Setup Header - the deck's title plate */}
                <motion.div
                  className={`${UI.plate} text-center py-7.5 px-5 overflow-hidden col-[1/3] row-1 flex flex-col justify-center items-center max-[1200px]:col-span-full max-md:col-1 max-md:row-auto max-md:py-5 max-md:px-4 max-md:rounded-[10px]`}
                  variants={fadeRise}
                >
                  <CornerTicks />
                  <div className="mb-3 text-verdi max-md:mb-2">
                    <Constellation
                      name={classData?.name || "flashcards"}
                      size={64}
                      className="max-md:h-11 max-md:w-11"
                    />
                  </div>
                  <p className={`mt-0 mx-0 mb-2 ${UI.overline}`}>
                    Compose your deck
                  </p>
                  <h2 className="mt-0 mx-0 mb-2 font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.01em] text-ink max-md:text-[22px]">
                    Create Flashcards
                  </h2>
                  <p className="m-0 text-[15px] text-muted max-md:text-[12px]">
                    Generate AI-powered flashcards from your study materials
                  </p>
                </motion.div>
                {/* Card Style */}
                <motion.div
                  className={`${CONFIG_CARD} col-1 row-2 max-[1200px]:col-1 max-[1200px]:row-auto max-md:col-1 max-md:row-auto`}
                  variants={fadeRise}
                >
                  <div className={CONFIG_CARD_HEADER}>
                    <h3 className={CONFIG_H3}>Style</h3>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {[
                      {
                        value: "standard" as CardStyle,
                        label: "Standard",
                        desc: "Concept & Explanation",
                      },
                      {
                        value: "definition" as CardStyle,
                        label: "Definition",
                        desc: "Term & Definition",
                      },
                      {
                        value: "qa" as CardStyle,
                        label: "Q&A",
                        desc: "Question & Answer",
                      },
                    ].map(({ value, label, desc }) => (
                      <motion.button
                        key={value}
                        className={styleBtn(cardStyle === value)}
                        onClick={() => setCardStyle(value)}
                        disabled={generatingCards}
                        {...pressLift}
                      >
                        <span
                          aria-hidden="true"
                          className={`shrink-0 text-[11px] leading-none ${
                            cardStyle === value ? "text-gold" : "opacity-0"
                          }`}
                        >
                          ✦
                        </span>
                        <span className="flex-1 text-[14px] font-semibold text-left">
                          {label}
                        </span>
                        <span className="font-mono text-[9px] font-medium uppercase tracking-widest opacity-60">
                          {desc}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {/* Number of Cards */}
                <motion.div
                  className={`${CONFIG_CARD} col-2 row-2 max-[1200px]:col-2 max-[1200px]:row-auto max-md:col-1 max-md:row-auto`}
                  variants={fadeRise}
                >
                  <div className={CONFIG_CARD_HEADER}>
                    <h3 className={CONFIG_H3}>Cards</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[5, 10, 15, 20, 25, 30].map((num) => (
                      <motion.button
                        key={num}
                        className={numberBtn(numCards === num)}
                        onClick={() => setNumCards(num)}
                        disabled={generatingCards}
                        {...pressLift}
                      >
                        <span className="font-display text-[20px] font-semibold leading-tight max-md:text-[18px]">
                          {num}
                        </span>
                        <span className="font-mono text-[8.5px] font-medium uppercase tracking-[0.14em] opacity-60">
                          cards
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {/* Files Selection Card - shared with Quiz. */}
                <FileSelectionCard
                  className="col-3 row-[1/3] max-[1200px]:col-span-full max-[1200px]:row-auto max-md:col-1 max-md:row-auto"
                  files={
                    (classData?.files?.filter(
                      (f: ClassFile) =>
                        f.name.toLowerCase().endsWith(".pdf") ||
                        f.name.toLowerCase().endsWith(".txt")
                    ) || []) as any
                  }
                  selectedIds={selectedFiles}
                  onSelectionChange={setSelectedFiles}
                  disabled={generatingCards}
                  emptyTitle="No supported files"
                  emptyHint="Upload PDF or TXT files to generate flashcards"
                />
              </motion.div>

              {/* Generate Button - the one gold CTA on this screen */}
              <Button
                variant="gold"
                className="mx-auto w-fit px-9"
                onClick={handleGenerateFlashcards}
                disabled={generatingCards || selectedFiles.length === 0}
              >
                <span aria-hidden="true" className="text-[13px]">
                  ✦
                </span>
                <span>Deal the deck</span>
              </Button>
            </motion.div>
          )}

          {/* Generating State - shared with Quiz. */}
          {generatingCards && (
            <GeneratingState
              key="generating"
              label="Composing cards…"
              description={`Creating ${numCards} ${cardStyle} flashcards from your selected files`}
              onCancel={handleCancelGeneration}
            />
          )}

          {/* Studying State */}
          {flashcardState === "studying" && currentCard && (
            <motion.div
              key="studying"
              className="w-full max-w-200 m-auto flex flex-col gap-7.5 p-5 max-[480px]:p-2.5 max-[480px]:gap-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Progress - thin gold route with a star at its tip */}
              <div className="w-full">
                <div className="relative w-full h-1 rounded-full bg-ink/15">
                  <motion.div
                    className="relative h-full rounded-full bg-gold after:absolute after:-right-1.25 after:top-1/2 after:-translate-y-1/2 after:text-[10px] after:leading-none after:text-gold after:content-['✦']"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="flex justify-between items-center mt-2.5">
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
                    Card {String(currentCardIndex + 1).padStart(2, "0")} /{" "}
                    {String(getActiveCards().length).padStart(2, "0")}
                  </span>
                  {studyMode === "unknown" && (
                    <span className="rounded-full border border-solid border-gold-deep/40 bg-gold/15 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-gold-deep">
                      Reviewing Unknown
                    </span>
                  )}
                </div>
              </div>

              {/* Flashcard - a two-faced atlas plate: vellum day-side flips
                  to a midnight answer-plate (day → night). */}
              <div
                className="perspective-[1000px] cursor-pointer w-full h-87.5 max-md:h-75 max-[480px]:h-65"
                onClick={handleFlipCard}
              >
                <motion.div
                  className="w-full h-full relative transform-3d"
                  initial={false}
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                >
                  {/* Front - the day plate */}
                  <div className={FLASHCARD_FACE_FRONT}>
                    <CornerTicks />
                    <div className={`${FLASHCARD_LABEL} text-muted`}>
                      Card {String(currentCardIndex + 1).padStart(2, "0")} /{" "}
                      {String(getActiveCards().length).padStart(2, "0")}
                    </div>
                    <p
                      className={`relative mt-0 mx-0 mb-3 ${UI.overlineMuted}`}
                    >
                      {cardStyle === "qa"
                        ? "Question"
                        : cardStyle === "definition"
                          ? "Term"
                          : "Front"}
                    </p>
                    <div className={FLASHCARD_CONTENT_FRONT}>
                      {currentCard.front}
                    </div>
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 text-gold/60 max-[480px]:bottom-3"
                      aria-hidden="true"
                    >
                      <path d={starPath(12, 12, 9)} fill="currentColor" />
                    </svg>
                  </div>
                  {/* Back - the night plate */}
                  <div className={FLASHCARD_FACE_BACK}>
                    <Starfield count={18} seed={3} />
                    <CornerTicks className="text-starlight/25" />
                    <p
                      className={`relative mt-0 mx-0 mb-3 ${UI.overlineNight}`}
                    >
                      {cardStyle === "qa"
                        ? "Answer"
                        : cardStyle === "definition"
                          ? "Definition"
                          : "Back"}
                    </p>
                    <div className={FLASHCARD_CONTENT_BACK}>
                      {currentCard.back}
                    </div>
                    {currentCard.category && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[80%] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-solid border-line-night bg-starlight/10 px-4 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-starlight/80 max-[480px]:bottom-3">
                        {currentCard.category}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Controls - instrument keys flanking the verdict pills */}
              <div className="flex justify-between items-center gap-5 max-md:flex-wrap max-md:justify-center max-md:gap-3">
                <IconButton
                  size="lg"
                  variant="key"
                  label="Previous card"
                  onClick={handlePrevCard}
                  disabled={currentCardIndex === 0}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </IconButton>

                <div className="flex items-center gap-3 max-md:w-full max-md:justify-center max-md:-order-1 max-[480px]:gap-2">
                  <motion.button
                    className={MARK_UNKNOWN_BTN}
                    onClick={handleMarkUnknown}
                    {...pressLift}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Still Learning
                  </motion.button>

                  <IconButton
                    size="lg"
                    variant="key"
                    label="Flip card"
                    onClick={handleFlipCard}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </IconButton>

                  <motion.button
                    className={MARK_KNOWN_BTN}
                    onClick={handleMarkKnown}
                    {...pressLift}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Got It!
                  </motion.button>
                </div>

                <IconButton
                  size="lg"
                  variant="key"
                  label="Skip card"
                  onClick={handleNextCard}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </IconButton>
              </div>

              {/* Tally - running instrument readouts */}
              <div className="flex justify-center gap-7.5 max-[480px]:gap-3.75">
                <div
                  className={`${STUDY_STAT_BASE} border-verdi/35 bg-sage/20 text-verdi`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="font-display text-[17px] font-semibold leading-none">
                    {knownCards.length}
                  </span>
                  <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] opacity-80">
                    Known
                  </span>
                </div>
                <div
                  className={`${STUDY_STAT_BASE} border-vermilion/35 bg-vermilion-wash/50 text-vermilion`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  <span className="font-display text-[17px] font-semibold leading-none">
                    {unknownCards.length}
                  </span>
                  <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] opacity-80">
                    Learning
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Completed State */}
          {flashcardState === "completed" && (
            <motion.div
              key="completed"
              className={`${UI.plate} w-full max-w-150 m-auto flex flex-col items-center gap-6 p-10 text-center max-md:p-6 max-[480px]:p-5 max-[480px]:gap-5`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <CornerTicks />
              {/* The deck's star-sign, fully charted */}
              <div className="text-verdi">
                <Constellation
                  name={classData?.name || "flashcards"}
                  size={84}
                  className="max-[480px]:h-16 max-[480px]:w-16"
                />
              </div>

              <div className="flex flex-col items-center gap-2">
                <p className={`m-0 ${UI.overline}`}>Deck complete</p>
                <h2 className="m-0 font-display text-[32px] font-semibold tracking-[-0.01em] text-ink max-md:text-[26px]">
                  Great Job!
                </h2>
                <p className="m-0 text-[15px] text-muted">
                  You've completed this deck
                </p>
              </div>

              <div className="flex gap-5 my-0 max-md:flex-wrap max-md:justify-center max-[480px]:gap-2.5">
                <div className={COMPLETED_STAT}>
                  <span className={COMPLETED_STAT_LABEL}>Known</span>
                  <span className={`${COMPLETED_STAT_VALUE} text-verdi`}>
                    {knownCards.length}
                  </span>
                </div>
                <div className={COMPLETED_STAT}>
                  <span className={COMPLETED_STAT_LABEL}>Reviewing</span>
                  <span className={`${COMPLETED_STAT_VALUE} text-vermilion`}>
                    {unknownCards.length}
                  </span>
                </div>
                <div className={COMPLETED_STAT}>
                  <span className={COMPLETED_STAT_LABEL}>Total</span>
                  <span className={`${COMPLETED_STAT_VALUE} text-ink`}>
                    {currentDeck?.length || 0}
                  </span>
                </div>
              </div>

              <div className="relative flex flex-col gap-3 w-full">
                {unknownCards.length > 0 && (
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={handleStudyUnknown}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Review {unknownCards.length} Unknown Cards
                  </Button>
                )}

                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={handleRestartDeck}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polyline points="1 4 1 10 7 10" />
                    <polyline points="23 20 23 14 17 14" />
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                  </svg>
                  Start Over
                </Button>

                <Button
                  variant={unknownCards.length > 0 ? "ghost" : "primary"}
                  className="w-full"
                  onClick={() => {
                    setFlashcardState("setup");
                    setCurrentDeck(null);
                    setKnownCards([]);
                    setUnknownCards([]);
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Create New Deck
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error Dialog - shared study error sheet ("Got it"). */}
      <StudyErrorDialog
        error={errorDialog}
        onClose={() =>
          setErrorDialog({ isOpen: false, title: "", message: "" })
        }
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
