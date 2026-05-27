import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import { fetchStreamingResponse } from "../services/aiService";
import { getFilePublicUrl } from "../utils/storageUtils";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import ConfirmDialog from "./ConfirmDialog";
import "./FlashcardsComponent.css";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const FlashcardsComponent = ({ isOpen, onClose, classData }) => {
  // Flashcard configuration
  const [numCards, setNumCards] = useState(10);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [cardStyle, setCardStyle] = useState("standard"); // standard, definition, qa

  // Flashcard state
  const [flashcardState, setFlashcardState] = useState("setup"); // setup, studying, completed
  const [currentDeck, setCurrentDeck] = useState(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [, setLoading] = useState(false);
  const [generatingCards, setGeneratingCards] = useState(false);

  // Card progress tracking
  const [knownCards, setKnownCards] = useState([]);
  const [unknownCards, setUnknownCards] = useState([]);
  const [studyMode, setStudyMode] = useState("all"); // all, unknown

  // History
  const [flashcardHistory, setFlashcardHistory] = useState([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  // Error dialog
  const [errorDialog, setErrorDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
  });

  // Delete confirmation
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState({
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

  const extractFileContent = async (file) => {
    try {
      const { url, error } = await getFilePublicUrl(
        "files",
        file.path || file.file_path
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
            const strings = content.items.map((it) => it.str).join(" ");
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
          const file = classData.files.find((f) => f.id === fileId);
          if (!file) return null;

          const content = await extractFileContent(file);
          if (!content) return null;

          return {
            name: file.name,
            content: content,
          };
        })
      );

      const validContents = fileContents.filter(Boolean);

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

      await fetchStreamingResponse(
        prompt,
        "",
        (chunk) => {
          flashcardData += chunk;
        },
        null,
        [],
        []
      );

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
          .map((id) => classData.files.find((f) => f.id === id)?.name)
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
      return currentDeck.filter((card) => unknownCards.includes(card.id));
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

  const handleLoadFromHistory = (historyItem) => {
    setCurrentDeck(historyItem.cards);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setKnownCards([]);
    setUnknownCards([]);
    setStudyMode("all");
    setShowHistoryDropdown(false);
    setFlashcardState("studying");
  };

  const handleDeleteHistory = async (deckId) => {
    try {
      await supabase.from("flashcard_history").delete().eq("id", deckId);
      loadFlashcardHistory();
      setDeleteConfirmDialog({ isOpen: false, deckId: null });
    } catch (error) {
      console.error("Error deleting flashcard history:", error);
    }
  };

  const toggleFileSelection = (fileId) => {
    if (selectedFiles.includes(fileId)) {
      setSelectedFiles(selectedFiles.filter((id) => id !== fileId));
    } else {
      setSelectedFiles([...selectedFiles, fileId]);
    }
  };

  const selectAllFiles = () => {
    if (classData?.files) {
      const supportedFiles = classData.files.filter(
        (f) =>
          f.name.toLowerCase().endsWith(".pdf") ||
          f.name.toLowerCase().endsWith(".txt")
      );
      setSelectedFiles(supportedFiles.map((f) => f.id));
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
      className="flashcards-component"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Header */}
      <div className="flashcards-header-modern">
        <motion.button
          className="flashcards-back-btn-modern"
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

        <div className="flashcards-header-content">
          <div className="flashcards-header-text">
            <h1>Flashcards</h1>
            <p>{classData?.name}</p>
          </div>
        </div>

        {/* History Dropdown */}
        <div className="flashcards-history-dropdown-container">
          <motion.button
            className="flashcards-history-dropdown-btn"
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
            <span>History</span>
            {flashcardHistory.length > 0 && (
              <span className="history-count-badge">
                {flashcardHistory.length}
              </span>
            )}
          </motion.button>

          <AnimatePresence>
            {showHistoryDropdown && (
              <>
                <div
                  className="dropdown-overlay"
                  onClick={() => setShowHistoryDropdown(false)}
                />
                <motion.div
                  className="flashcards-history-dropdown-menu"
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="dropdown-header">
                    <h3>Flashcard History</h3>
                    <span className="history-count">
                      {flashcardHistory.length} decks
                    </span>
                  </div>
                  <div className="dropdown-content">
                    {flashcardHistory.length === 0 ? (
                      <div className="flashcards-no-history-modern">
                        <div className="empty-history-icon">
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
                        <p>No flashcard decks yet</p>
                        <span>Generate your first deck to get started</span>
                      </div>
                    ) : (
                      flashcardHistory.map((item) => (
                        <motion.div
                          key={item.id}
                          className="flashcards-history-card-modern"
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                        >
                          <div className="history-card-header">
                            <div className="history-date-badge">
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
                              className="history-delete-btn"
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

                          <div className="history-meta">
                            <span className="meta-badge cards-badge">
                              <span className="badge-emoji">📇</span>
                              {item.num_cards} cards
                            </span>
                            <span className="meta-badge style-badge">
                              <span className="badge-emoji">✨</span>
                              {item.card_style}
                            </span>
                          </div>

                          {item.source_files &&
                            item.source_files.length > 0 && (
                              <div className="history-files">
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
                            className="history-study-btn"
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

      {/* Content Area */}
      <div className="flashcards-content-area">
        <AnimatePresence mode="wait">
          {/* Setup State */}
          {flashcardState === "setup" && (
            <motion.div
              key="setup"
              className="flashcards-setup-modern"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Config Grid */}
              <div className="flashcards-config-grid">
                {/* Setup Header */}
                <div className="flashcards-setup-header">
                  <div className="flashcards-setup-icon">
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
                  <h2>Create Flashcards</h2>
                  <p>
                    Generate AI-powered flashcards from your study materials
                  </p>
                </div>
                {/* Card Style */}
                <div className="flashcards-config-card flashcards-style-card">
                  <div className="flashcards-config-card-header">
                    <div className="flashcards-config-icon style-icon">
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
                    <h3>Card Style</h3>
                  </div>
                  <div className="flashcards-style-options">
                    <button
                      className={`flashcards-style-btn ${
                        cardStyle === "standard" ? "active" : ""
                      }`}
                      onClick={() => setCardStyle("standard")}
                      disabled={generatingCards}
                    >
                      <span className="style-emoji">📝</span>
                      <span className="style-label">Standard</span>
                      <span className="style-desc">Concept & Explanation</span>
                    </button>
                    <button
                      className={`flashcards-style-btn ${
                        cardStyle === "definition" ? "active" : ""
                      }`}
                      onClick={() => setCardStyle("definition")}
                      disabled={generatingCards}
                    >
                      <span className="style-emoji">📖</span>
                      <span className="style-label">Definition</span>
                      <span className="style-desc">Term & Definition</span>
                    </button>
                    <button
                      className={`flashcards-style-btn ${
                        cardStyle === "qa" ? "active" : ""
                      }`}
                      onClick={() => setCardStyle("qa")}
                      disabled={generatingCards}
                    >
                      <span className="style-emoji">❓</span>
                      <span className="style-label">Q&A</span>
                      <span className="style-desc">Question & Answer</span>
                    </button>
                  </div>
                </div>

                {/* Number of Cards */}
                <div className="flashcards-config-card flashcards-num-card">
                  <div className="flashcards-config-card-header">
                    <div className="flashcards-config-icon num-icon">
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
                    <h3>Number of Cards</h3>
                  </div>
                  <div className="flashcards-number-grid">
                    {[5, 10, 15, 20, 25, 30].map((num) => (
                      <button
                        key={num}
                        className={`flashcards-number-btn ${
                          numCards === num ? "active" : ""
                        }`}
                        onClick={() => setNumCards(num)}
                        disabled={generatingCards}
                      >
                        <span className="num-value">{num}</span>
                        <span className="num-label">cards</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Files Selection */}
                <div className="flashcards-config-card flashcards-files-card">
                  <div className="flashcards-config-card-header">
                    <div className="flashcards-config-icon files-icon">
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
                    <div className="files-header-content">
                      <h3>Source Files</h3>
                      <span className="files-count">
                        {selectedFiles.length} selected
                      </span>
                    </div>
                  </div>
                  <div className="files-actions">
                    <button onClick={selectAllFiles} disabled={generatingCards}>
                      Select All
                    </button>
                    <button
                      onClick={deselectAllFiles}
                      disabled={generatingCards}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flashcards-files-grid">
                    {classData?.files?.filter(
                      (f) =>
                        f.name.toLowerCase().endsWith(".pdf") ||
                        f.name.toLowerCase().endsWith(".txt")
                    ).length === 0 ? (
                      <div className="flashcards-no-files-modern">
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
                        <p>No supported files</p>
                        <span>
                          Upload PDF or TXT files to generate flashcards
                        </span>
                      </div>
                    ) : (
                      classData?.files
                        ?.filter(
                          (f) =>
                            f.name.toLowerCase().endsWith(".pdf") ||
                            f.name.toLowerCase().endsWith(".txt")
                        )
                        .map((file) => (
                          <div
                            key={file.id}
                            className={`flashcards-file-card ${
                              selectedFiles.includes(file.id) ? "selected" : ""
                            }`}
                            onClick={() =>
                              !generatingCards && toggleFileSelection(file.id)
                            }
                          >
                            <input
                              type="checkbox"
                              checked={selectedFiles.includes(file.id)}
                              onChange={() => {}}
                              disabled={generatingCards}
                            />
                            <div className="file-icon">
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
                            <div className="file-info">
                              <span className="file-name">{file.name}</span>
                              <span className="file-type">
                                {file.name.split(".").pop().toUpperCase()}
                              </span>
                            </div>
                            <div className="file-checkbox-indicator">
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
                className="flashcards-generate-btn-modern"
                onClick={handleGenerateFlashcards}
                disabled={generatingCards || selectedFiles.length === 0}
                whileTap={{ scale: 0.95 }}
              >
                {generatingCards ? (
                  <>
                    <div className="btn-spinner"></div>
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
              className="flashcards-study-modern"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Progress Bar */}
              <div className="flashcards-progress-container">
                <div className="flashcards-progress-bar">
                  <motion.div
                    className="flashcards-progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="flashcards-progress-text">
                  <span>
                    Card {currentCardIndex + 1} of {getActiveCards().length}
                  </span>
                  {studyMode === "unknown" && (
                    <span className="study-mode-badge">Reviewing Unknown</span>
                  )}
                </div>
              </div>

              {/* Flashcard */}
              <div className="flashcard-container" onClick={handleFlipCard}>
                <motion.div
                  className={`flashcard ${isFlipped ? "flipped" : ""}`}
                  initial={false}
                  animate={{ rotateY: isFlipped ? 180 : 0 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                >
                  <div className="flashcard-front">
                    <div className="flashcard-label">
                      {cardStyle === "qa"
                        ? "Question"
                        : cardStyle === "definition"
                        ? "Term"
                        : "Front"}
                    </div>
                    <div className="flashcard-content">{currentCard.front}</div>
                    <div className="flashcard-hint">Click to flip</div>
                  </div>
                  <div className="flashcard-back">
                    <div className="flashcard-label">
                      {cardStyle === "qa"
                        ? "Answer"
                        : cardStyle === "definition"
                        ? "Definition"
                        : "Back"}
                    </div>
                    <div className="flashcard-content">{currentCard.back}</div>
                    {currentCard.category && (
                      <div className="flashcard-category">
                        {currentCard.category}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Controls */}
              <div className="flashcards-controls">
                <motion.button
                  className="flashcard-control-btn prev-btn"
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

                <div className="flashcard-action-btns">
                  <motion.button
                    className="flashcard-action-btn unknown-btn"
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
                    className="flashcard-action-btn known-btn"
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
                  className="flashcard-control-btn next-btn"
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
              <div className="flashcards-stats">
                <div className="stat-item known">
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
                <div className="stat-item unknown">
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
              className="flashcards-completed-modern"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className="completed-icon">
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

              <h2>Great Job!</h2>
              <p>You've completed this deck</p>

              <div className="completed-stats">
                <div className="completed-stat known">
                  <span className="stat-value">{knownCards.length}</span>
                  <span className="stat-label">Known</span>
                </div>
                <div className="completed-stat unknown">
                  <span className="stat-value">{unknownCards.length}</span>
                  <span className="stat-label">Still Learning</span>
                </div>
                <div className="completed-stat total">
                  <span className="stat-value">{currentDeck?.length || 0}</span>
                  <span className="stat-label">Total Cards</span>
                </div>
              </div>

              <div className="completed-actions">
                {unknownCards.length > 0 && (
                  <motion.button
                    className="completed-btn study-unknown-btn"
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
                  className="completed-btn restart-btn"
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
                  className="completed-btn new-deck-btn"
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
