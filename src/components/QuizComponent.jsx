import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import { fetchStreamingResponse } from "../services/aiService";
import { getFilePublicUrl } from "../utils/storageUtils";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import ConfirmDialog from "./ConfirmDialog";
import "./QuizComponent.css";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const QuizComponent = ({ isOpen, onClose, classData, allClasses = [] }) => {
  // Quiz configuration
  const [difficulty, setDifficulty] = useState("medium");
  const [numQuestions, setNumQuestions] = useState(10);
  const [selectedFiles, setSelectedFiles] = useState([]);

  // Quiz state
  const [quizState, setQuizState] = useState("setup"); // setup, taking, reviewing, completed
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);

  // History - dropdown menu
  const [quizHistory, setQuizHistory] = useState([]);

  // History dropdown toggle
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);

  // Debug logs
  const [debugLogs, setDebugLogs] = useState([]);

  // Error dialog state
  const [errorDialog, setErrorDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
  });

  // Delete quiz confirmation dialog state
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState({
    isOpen: false,
    quizId: null,
  });

  // Helper function to add debug logs
  const addDebugLog = (message, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs((prev) => [...prev, { message, type, timestamp }]);
    console.log(`[${timestamp}] ${message}`);
  };

  useEffect(() => {
    if (isOpen && classData) {
      // Load quiz history for this class
      loadQuizHistory();
    }
  }, [isOpen, classData]);

  // Prevent background scroll when quiz is open
  useEffect(() => {
    if (isOpen) {
      // Store original overflow style
      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;

      // Prevent scrolling
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";

      // Cleanup function to restore scroll when component unmounts or closes
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.width = "";
      };
    }
  }, [isOpen]);

  // Scroll to top when quiz state changes to taking or reviewing
  useEffect(() => {
    if (quizState === "taking" || quizState === "reviewing") {
      const contentArea = document.querySelector(".quiz-content-area");
      if (contentArea) {
        contentArea.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [quizState]);

  const loadQuizHistory = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("quiz_history")
        .select("*")
        .eq("user_id", user.id)
        .eq("class_id", classData.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        setQuizHistory(data);
      }
    } catch (error) {
      console.error("Error loading quiz history:", error);
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
    if (quizState === "taking" || quizState === "reviewing") {
      // If taking a quiz or reviewing results, go back to setup
      setQuizState("setup");
      setCurrentQuiz(null);
      setUserAnswers({});
      setQuizScore(null);
    } else {
      // If in setup state, close the quiz component
      onClose();
    }
  };

  const handleGenerateQuiz = async () => {
    if (selectedFiles.length === 0) {
      setErrorDialog({
        isOpen: true,
        title: "No Files Selected",
        message: "Please select at least one file to generate a quiz from.",
      });
      return;
    }

    setGeneratingQuiz(true);
    setLoading(true);
    setDebugLogs([]); // Clear previous logs

    try {
      addDebugLog(
        `🚀 Starting quiz generation with ${selectedFiles.length} files`
      );

      // Build context from selected files
      const fileContents = await Promise.all(
        selectedFiles.map(async (fileId) => {
          const file = classData.files.find((f) => f.id === fileId);
          if (!file) {
            addDebugLog(`❌ File ID ${fileId} not found`, "error");
            return null;
          }

          const content = await extractFileContent(file);
          if (!content) {
            addDebugLog(`❌ No content from ${file.name}`, "error");
            return null;
          }

          addDebugLog(`✅ Success: ${content.length} chars from ${file.name}`);
          return {
            name: file.name,
            content: content,
          };
        })
      );

      const validContents = fileContents.filter(Boolean);
      addDebugLog(
        `📊 Result: ${validContents.length}/${selectedFiles.length} files successful`
      );

      if (validContents.length === 0) {
        addDebugLog(`❌ FAILED: No content extracted from any file`, "error");
        const errorMessage =
          "Could not extract content from the selected files. This could be because:\n\n" +
          "• PDF files are image-based (scanned documents without text)\n" +
          "• Files are empty or corrupted\n" +
          "• Image files are not supported for quiz generation\n\n" +
          "Please try:\n" +
          "1. Selecting different files (PDF or TXT)\n" +
          "2. Ensuring PDFs contain actual text (not just images)\n" +
          "3. Checking the browser console for detailed errors";

        setErrorDialog({
          isOpen: true,
          title: "Unsupported File Format",
          message: errorMessage,
        });
        setGeneratingQuiz(false);
        setLoading(false);
        return;
      }

      const filesContext = validContents
        .map((f) => `=== ${f.name} ===\n${f.content}`)
        .join("\n\n");

      addDebugLog(`✓ Built context: ${filesContext.length} chars`);
      addDebugLog(`🤖 Sending request to AI...`);

      // Determine point ranges based on difficulty (reduced to 1-5)
      const pointRanges = {
        easy: { min: 1, max: 2 },
        medium: { min: 2, max: 4 },
        hard: { min: 3, max: 5 },
      };

      const range = pointRanges[difficulty];

      const prompt = `You are an expert quiz generator. Create a comprehensive ${difficulty} difficulty quiz with exactly ${numQuestions} questions based on the following educational content.

CONTENT TO BASE QUIZ ON:
${filesContext}

QUIZ REQUIREMENTS:
1. Generate exactly ${numQuestions} questions
2. Difficulty level: ${difficulty.toUpperCase()}
3. Question types:
   - Multiple Choice (vary between 3-6 options, use index 0-5 for correct answer)
   - True/False (options: ["True", "False"], 0 or 1 for correct answer)
   - Short Answer (provide exact expected answer)
4. Points: ${range.min}-${range.max} based on question complexity
5. Each question must have a clear explanation
6. Questions should cover different aspects of the content
7. Mix question types and complexity levels

RESPONSE FORMAT (JSON only, no markdown):
{
  "questions": [
    {
      "id": 1,
      "type": "multiple-choice",
      "question": "What is the main concept discussed in the content?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Clear explanation of why this is correct",
      "points": ${range.min}
    },
    {
      "id": 2,
      "type": "true-false",
      "question": "The content states that...",
      "options": ["True", "False"],
      "correctAnswer": 0,
      "explanation": "Explanation based on the content",
      "points": ${range.max}
    },
    {
      "id": 3,
      "type": "short-answer",
      "question": "Define the key term mentioned in the content.",
      "correctAnswer": "Expected answer",
      "explanation": "Why this answer is correct",
      "points": ${range.max}
    }
  ]
}

CRITICAL JSON FORMATTING RULES:
- All text strings MUST be properly escaped
- Use double quotes for strings, not single quotes
- Escape special characters: newlines as \\n, quotes as \\" or use single quotes inside
- Do not include any text before or after the JSON
- Do not use markdown code blocks
- Return ONLY valid JSON that can be parsed directly`;

      let quizData = "";

      addDebugLog(`📤 Sending prompt to AI (${prompt.length} chars)...`);

      await fetchStreamingResponse(
        prompt, // userMessage
        "", // context (empty, we already included it in the prompt)
        (chunk) => {
          // onToken callback
          quizData += chunk;
        },
        null, // signal
        [], // history
        [] // files
      );

      addDebugLog(`✓ Received AI response: ${quizData.length} chars`);
      addDebugLog(`🔍 Parsing quiz data...`);

      // Clean up the response
      let cleanedData = quizData.trim();

      // Remove markdown code blocks if present
      cleanedData = cleanedData.replace(/^```json\s*/i, "");
      cleanedData = cleanedData.replace(/^```\s*/i, "");
      cleanedData = cleanedData.replace(/\s*```$/i, "");
      cleanedData = cleanedData.trim();

      // Find JSON object in response
      const jsonStart = cleanedData.indexOf("{");
      const jsonEnd = cleanedData.lastIndexOf("}");

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("No valid JSON found in response");
      }

      cleanedData = cleanedData.substring(jsonStart, jsonEnd + 1);

      // Log the cleaned data for debugging
      addDebugLog(
        `📋 Cleaned JSON preview: ${cleanedData.substring(0, 200)}...`
      );

      let parsedQuiz;
      try {
        parsedQuiz = JSON.parse(cleanedData);
      } catch (parseError) {
        // If JSON parsing fails, try to fix common issues
        addDebugLog(
          `⚠️ Initial parse failed, attempting to fix JSON...`,
          "warning"
        );

        // Try to fix unescaped quotes in strings
        let fixedData = cleanedData;

        // Replace smart quotes with regular quotes
        fixedData = fixedData.replace(/[""]/g, '\\"');
        fixedData = fixedData.replace(/['']/g, "'");

        // Try to fix common JSON issues
        // Remove any trailing commas before closing braces/brackets
        fixedData = fixedData.replace(/,(\s*[}\]])/g, "$1");

        try {
          parsedQuiz = JSON.parse(fixedData);
          addDebugLog(`✓ JSON fixed and parsed successfully!`, "success");
        } catch (secondError) {
          // Log the problematic JSON for debugging
          addDebugLog(`❌ Raw JSON that failed: ${cleanedData}`, "error");
          throw new Error(
            `JSON parsing failed: ${parseError.message}. The AI response may contain improperly formatted JSON. Please try generating the quiz again.`
          );
        }
      }

      // Validate quiz structure
      if (!parsedQuiz.questions || !Array.isArray(parsedQuiz.questions)) {
        throw new Error("Invalid quiz structure: missing questions array");
      }

      if (parsedQuiz.questions.length === 0) {
        throw new Error("No questions generated");
      }

      addDebugLog(
        `✓ Quiz validated: ${parsedQuiz.questions.length} questions found`
      );

      // Ensure all questions have required fields
      parsedQuiz.questions = parsedQuiz.questions.map((q, idx) => ({
        id: q.id || idx + 1,
        type: q.type || "multiple-choice",
        question: q.question || "Question text missing",
        options: q.options || [],
        correctAnswer: q.correctAnswer ?? 0,
        explanation: q.explanation || "No explanation provided",
        points: q.points || range.min, // Default to minimum points for the difficulty level
      }));

      setCurrentQuiz({
        ...parsedQuiz,
        difficulty,
        numQuestions,
        selectedFiles,
        classId: classData.id,
        className: classData.name,
        createdAt: new Date().toISOString(),
      });

      setQuizState("taking");
      setUserAnswers({});
      setQuizScore(null);

      addDebugLog(
        `✅ Quiz generated successfully with ${parsedQuiz.questions.length} questions!`,
        "success"
      );
    } catch (error) {
      console.error("Error generating quiz:", error);
      addDebugLog(`❌ ERROR: ${error.message}`, "error");
      addDebugLog(`Error details: ${error.stack}`, "error");

      const errorMsg = `Failed to generate quiz: ${error.message}\n\nPlease check the debug panel for details or try again.`;
      setErrorDialog({
        isOpen: true,
        title: "Quiz Generation Failed",
        message: errorMsg,
      });
    } finally {
      setGeneratingQuiz(false);
      setLoading(false);
    }
  };

  const handleCancelGeneration = () => {
    setGeneratingQuiz(false);
    setLoading(false);
    setQuizState("setup");
    addDebugLog("🚫 Quiz generation cancelled by user");
  };

  const handleAnswerChange = (questionId, answer) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  const handleSubmitQuiz = async () => {
    if (!currentQuiz) return;

    // Calculate score
    let totalPoints = 0;
    let earnedPoints = 0;
    const results = {};

    currentQuiz.questions.forEach((question) => {
      totalPoints += question.points;
      const userAnswer = userAnswers[question.id];

      let isCorrect = false;

      // Check based on question type
      if (
        question.type === "multiple-choice" ||
        question.type === "true-false"
      ) {
        isCorrect = parseInt(userAnswer) === parseInt(question.correctAnswer);
      } else if (question.type === "short-answer") {
        // Case-insensitive comparison for short answers
        const userAns = (userAnswer || "").toLowerCase().trim();
        const correctAns = String(question.correctAnswer).toLowerCase().trim();
        isCorrect = userAns === correctAns;
      }

      if (isCorrect) {
        earnedPoints += question.points;
      }

      results[question.id] = {
        userAnswer,
        isCorrect,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        question: question.question,
        type: question.type,
        options: question.options,
        points: question.points,
      };
    });

    const scoreData = {
      totalPoints,
      earnedPoints,
      percentage: Math.round((earnedPoints / totalPoints) * 100),
      correctCount: Object.values(results).filter((r) => r.isCorrect).length,
      totalQuestions: currentQuiz.questions.length,
      results,
    };

    setQuizScore(scoreData);
    setQuizState("reviewing");

    // Save to history
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        // Include selectedFiles in quiz_data for history
        const quizDataWithFiles = {
          ...currentQuiz,
          selectedFiles: selectedFiles,
        };

        await supabase.from("quiz_history").insert({
          user_id: user.id,
          class_id: classData.id,
          quiz_data: quizDataWithFiles,
          user_answers: userAnswers,
          score: scoreData,
          created_at: new Date().toISOString(),
        });

        loadQuizHistory();
      }
    } catch (error) {
      console.error("Error saving quiz history:", error);
    }
  };

  const handleRetakeWithSameSettings = async () => {
    // Save current quiz to history first
    if (currentQuiz && quizScore) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          // Include selectedFiles in quiz_data for history
          const quizDataWithFiles = {
            ...currentQuiz,
            selectedFiles: selectedFiles,
          };

          await supabase.from("quiz_history").insert({
            user_id: user.id,
            class_id: classData.id,
            quiz_data: quizDataWithFiles,
            user_answers: userAnswers,
            score: quizScore,
            created_at: new Date().toISOString(),
          });
          loadQuizHistory();
        }
      } catch (error) {
        console.error("Error saving quiz history:", error);
      }
    }

    // Reset and generate new quiz with same settings
    setQuizState("setup");
    setCurrentQuiz(null);
    setUserAnswers({});
    setQuizScore(null);
    setGeneratingQuiz(true);

    // Generate new quiz
    await handleGenerateQuiz();
  };

  const handleQuit = () => {
    // Quit without saving
    setQuizState("setup");
    setCurrentQuiz(null);
    setUserAnswers({});
    setQuizScore(null);
  };

  const handleDone = () => {
    setQuizState("setup");
    setCurrentQuiz(null);
    setUserAnswers({});
    setQuizScore(null);
    setDifficulty("medium");
    setNumQuestions(10);
    setSelectedFiles([]);
  };

  const loadQuizFromHistory = (historyItem) => {
    console.log("Loading quiz from history:", historyItem);

    // Restore quiz data
    setCurrentQuiz(historyItem.quiz_data);
    setUserAnswers(historyItem.user_answers || {});
    setQuizScore(historyItem.score);

    // Restore quiz configuration from quiz_data
    if (historyItem.quiz_data) {
      setSelectedFiles(historyItem.quiz_data.selectedFiles || []);
      setDifficulty(historyItem.quiz_data.difficulty || "medium");
      setNumQuestions(
        historyItem.quiz_data.numQuestions ||
          historyItem.quiz_data.questions?.length ||
          10
      );
    }

    setQuizState("reviewing");
  };

  const handleDeleteClick = (e, quizId) => {
    e.stopPropagation(); // Prevent triggering loadQuizFromHistory
    setDeleteConfirmDialog({
      isOpen: true,
      quizId: quizId,
    });
  };

  const deleteQuizFromHistory = async () => {
    const quizId = deleteConfirmDialog.quizId;

    // Close the dialog first
    setDeleteConfirmDialog({ isOpen: false, quizId: null });

    try {
      const { error } = await supabase
        .from("quiz_history")
        .delete()
        .eq("id", quizId);

      if (error) throw error;

      // Update local state
      setQuizHistory((prev) => prev.filter((item) => item.id !== quizId));
      addDebugLog(`Quiz deleted successfully (ID: ${quizId})`, "success");
    } catch (error) {
      console.error("Error deleting quiz:", error);
      setErrorDialog({
        isOpen: true,
        title: "Delete Failed",
        message: "Failed to delete quiz from history. Please try again.",
      });
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      className="quiz-component"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Modern Header */}
      <div className="quiz-header-modern">
        <motion.button
          className="quiz-back-btn-modern"
          onClick={handleBackButton}
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
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </motion.button>
        <div className="quiz-header-content">
          {/* <div className="quiz-header-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div> */}
          <div className="quiz-header-text">
            <h1>{classData?.name}</h1>
            <p>Interactive Quiz Session</p>
          </div>
        </div>

        {/* History Dropdown Button */}
        <div className="quiz-history-dropdown-container">
          <motion.button
            className="quiz-history-dropdown-btn"
            onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>History</span>
          </motion.button>

          {/* Dropdown Overlay - closes dropdown when clicking outside */}
          {showHistoryDropdown && (
            <div
              className="dropdown-overlay"
              onClick={() => setShowHistoryDropdown(false)}
            />
          )}

          {/* History Dropdown Menu */}
          <AnimatePresence>
            {showHistoryDropdown && (
              <motion.div
                className="quiz-history-dropdown-menu"
                onClick={(e) => e.stopPropagation()} // Prevent clicks from bubbling to overlay
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <div className="dropdown-header">
                  <h3>Quiz History</h3>
                  <span className="history-count">
                    {quizHistory.length}{" "}
                    {quizHistory.length === 1 ? "quiz" : "quizzes"}
                  </span>
                </div>

                <div className="dropdown-content">
                  {quizHistory.length > 0 ? (
                    quizHistory.map((item, index) => {
                      // Handle both old and new quiz data structures
                      const numQuestions =
                        item.quiz_data?.numQuestions ||
                        item.quiz_data?.questions?.length ||
                        0;
                      const difficulty = item.quiz_data?.difficulty || "medium";
                      const selectedFiles = item.quiz_data?.selectedFiles || [];

                      // Debug logging
                      console.log("History item:", {
                        numQuestions,
                        difficulty,
                        selectedFiles,
                        score: item.score,
                      });

                      // Get difficulty emoji
                      const difficultyEmoji =
                        difficulty === "easy"
                          ? "😊"
                          : difficulty === "hard"
                          ? "🔥"
                          : "🤔";

                      return (
                        <motion.div
                          key={item.id}
                          className="quiz-history-card-modern"
                          onClick={() => {
                            loadQuizFromHistory(item);
                            setShowHistoryDropdown(false);
                          }}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          whileHover={{
                            scale: 1.02,
                            y: -3,
                            transition: {
                              type: "spring",
                              stiffness: 300,
                              damping: 20,
                            },
                          }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div className="history-card-header">
                            <div className="history-date-badge">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
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
                                />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                              <span>
                                {new Date(item.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <motion.button
                              className="history-delete-btn"
                              onClick={(e) => handleDeleteClick(e, item.id)}
                              whileHover={{
                                scale: 1.15,
                                rotate: 10,
                                transition: {
                                  type: "spring",
                                  stiffness: 300,
                                  damping: 8,
                                },
                              }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            </motion.button>
                          </div>

                          <div className="history-score-display">
                            <div className="score-circle-mini">
                              <svg
                                viewBox="0 0 36 36"
                                className="circular-chart"
                              >
                                <path
                                  className="circle-bg"
                                  d="M18 2.0845
                                    a 15.9155 15.9155 0 0 1 0 31.831
                                    a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                                <path
                                  className="circle"
                                  strokeDasharray={`${item.score.percentage}, 100`}
                                  d="M18 2.0845
                                    a 15.9155 15.9155 0 0 1 0 31.831
                                    a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                              </svg>
                              <div className="percentage-text">
                                {item.score.percentage}%
                              </div>
                            </div>

                            <div className="score-details">
                              <div className="score-label">Score</div>
                              <div className="score-fraction">
                                {item.score.correctCount}/{numQuestions}
                              </div>
                            </div>
                          </div>

                          <div className="history-meta">
                            <span className="meta-badge difficulty-badge">
                              <span className="badge-emoji">
                                {difficultyEmoji}
                              </span>
                              {difficulty}
                            </span>
                            <span className="meta-badge questions-badge">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <line x1="8" y1="6" x2="21" y2="6" />
                                <line x1="8" y1="12" x2="21" y2="12" />
                                <line x1="8" y1="18" x2="21" y2="18" />
                                <line x1="3" y1="6" x2="3.01" y2="6" />
                                <line x1="3" y1="12" x2="3.01" y2="12" />
                                <line x1="3" y1="18" x2="3.01" y2="18" />
                              </svg>
                              {numQuestions}
                            </span>
                          </div>

                          {selectedFiles.length > 0 && (
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
                                <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                                <polyline points="13 2 13 9 20 9" />
                              </svg>
                              <span>
                                {selectedFiles
                                  .map((fileId) => {
                                    const file = classData?.files?.find(
                                      (f) => f.id === fileId
                                    );
                                    return file?.name || "Unknown";
                                  })
                                  .slice(0, 2)
                                  .join(", ")}
                                {selectedFiles.length > 2 &&
                                  ` +${selectedFiles.length - 2}`}
                              </span>
                            </div>
                          )}
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="quiz-no-history-modern">
                      <div className="empty-history-icon">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="48"
                          height="48"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </div>
                      <p>No History Yet</p>
                      <span>Your quiz attempts will appear here</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="quiz-content-area">
        <AnimatePresence mode="wait">
          {/* Setup State */}
          {quizState === "setup" && !generatingQuiz && (
            <motion.div
              key="setup"
              className="quiz-setup-modern"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              {/* Configuration Cards Grid */}
              <div className="quiz-config-grid">
                {/* Header Section */}
                <div className="quiz-setup-header">
                  <motion.div
                    className="quiz-setup-icon"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1, rotate: 360 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 15,
                      delay: 0.2,
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="40"
                      height="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      viewBox="0 0 24 24"
                    >
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      <path d="M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
                      <line x1="9" y1="12" x2="15" y2="12" />
                      <line x1="9" y1="16" x2="13" y2="16" />
                    </svg>
                  </motion.div>
                  <h2>Create Your Quiz</h2>
                  <p>Customize difficulty, length, and source materials</p>
                </div>

                {/* Difficulty Card */}
                <motion.div
                  className="quiz-config-card quiz-difficulty-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="quiz-config-card-header">
                    <div className="quiz-config-icon difficulty-icon">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </div>
                    <h3>Difficulty Level</h3>
                  </div>
                  <div className="quiz-difficulty-options">
                    {[
                      {
                        level: "easy",
                        label: "Easy",
                        desc: "1-2 pts",
                        icon: "😊",
                      },
                      {
                        level: "medium",
                        label: "Medium",
                        desc: "2-4 pts",
                        icon: "🤔",
                      },
                      {
                        level: "hard",
                        label: "Hard",
                        desc: "3-5 pts",
                        icon: "🔥",
                      },
                    ].map(({ level, label, desc, icon }) => (
                      <motion.button
                        key={level}
                        className={`quiz-difficulty-btn ${
                          difficulty === level ? "active" : ""
                        }`}
                        onClick={() => setDifficulty(level)}
                        disabled={generatingQuiz}
                        whileHover={{ scale: 1.04, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="diff-emoji">{icon}</span>
                        <span className="diff-label">{label}</span>
                        <span className="diff-desc">{desc}</span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {/* Number of Questions Card */}
                <motion.div
                  className="quiz-config-card quiz-questions-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="quiz-config-card-header">
                    <div className="quiz-config-icon questions-icon">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <circle cx="5" cy="6" r="1.5" />
                        <circle cx="5" cy="12" r="1.5" />
                        <circle cx="5" cy="18" r="1.5" />
                        <line x1="9" y1="6" x2="21" y2="6" />
                        <line x1="9" y1="12" x2="21" y2="12" />
                        <line x1="9" y1="18" x2="21" y2="18" />
                      </svg>
                    </div>
                    <h3>Number of Questions</h3>
                  </div>
                  <div className="quiz-number-grid">
                    {[10, 20, 30, 40, 50, 100].map((num) => (
                      <motion.button
                        key={num}
                        className={`quiz-number-btn ${
                          numQuestions === num ? "active" : ""
                        }`}
                        onClick={() => setNumQuestions(num)}
                        disabled={generatingQuiz}
                        whileHover={{ scale: 1.05, y: -3 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="num-value">{num}</span>
                        <span className="num-label">questions</span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {/* Files Selection Card */}
                <motion.div
                  className="quiz-files-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="quiz-config-card-header">
                    <div className="quiz-config-icon files-icon">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                        <polyline points="13 2 13 9 20 9" />
                      </svg>
                    </div>
                    <div className="files-header-content">
                      <h3>Select Source Files</h3>
                      <span className="files-count">
                        {selectedFiles.length} selected
                      </span>
                    </div>
                  </div>
                  <div className="quiz-files-grid">
                    {classData?.files && classData.files.length > 0 ? (
                      classData.files.map((file, index) => (
                        <motion.label
                          key={file.id}
                          className={`quiz-file-card ${
                            selectedFiles.includes(file.id) ? "selected" : ""
                          }`}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 + index * 0.05 }}
                          // whileHover={{ y: -5, scale: 1.02 }}
                          // whileTap={{ scale: 0.98 }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFiles.includes(file.id)}
                            disabled={generatingQuiz}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedFiles([...selectedFiles, file.id]);
                              } else {
                                setSelectedFiles(
                                  selectedFiles.filter((id) => id !== file.id)
                                );
                              }
                            }}
                          />
                          <div className="file-icon">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                          </div>
                          <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-type">
                              {file.name.split(".").pop()?.toUpperCase()}
                            </span>
                          </div>
                          <div className="file-checkbox-indicator">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        </motion.label>
                      ))
                    ) : (
                      <div className="quiz-no-files-modern">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="48"
                          height="48"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                          <polyline points="13 2 13 9 20 9" />
                        </svg>
                        <p>No files available in this class</p>
                        <span>Upload files to create quizzes</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Generate Button */}
              <motion.button
                className="quiz-generate-btn-modern"
                onClick={handleGenerateQuiz}
                disabled={selectedFiles.length === 0 || generatingQuiz}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                whileHover={{
                  scale: 1.03,
                  y: -3,
                  transition: {
                    type: "spring",
                    stiffness: 300,
                    damping: 5,
                  },
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
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Generate Quiz</span>
              </motion.button>
            </motion.div>
          )}

          {/* Generating State */}
          {generatingQuiz && (
            <motion.div
              key="generating"
              className="quiz-center-container"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="quiz-loading-state">
                <div className="quiz-loading-spinner"></div>
                <h2>Generating Your Quiz...</h2>
                <p>
                  Creating {numQuestions} {difficulty} questions from your
                  selected files
                </p>
                <motion.button
                  whileHover={{
                    scale: 1.03,
                    y: -5,
                    transition: {
                      type: "spring",
                      stiffness: 300,
                      damping: 8,
                    },
                  }}
                  whileTap={{ scale: 0.98 }}
                  className="quiz-cancel-button"
                  onClick={handleCancelGeneration}
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Taking Quiz State */}
          {quizState === "taking" && currentQuiz && (
            <motion.div
              key="taking"
              className="quiz-taking-container"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="quiz-taking">
                {/* Left Side - Scrollable Questions */}
                <div className="quiz-questions">
                  {currentQuiz.questions.map((question, index) => (
                    <div key={question.id} className="quiz-question-card">
                      <div className="quiz-question-header">
                        <span className="quiz-question-number">
                          Question {index + 1}
                        </span>
                        <span className="quiz-question-points">
                          {question.points} points
                        </span>
                      </div>
                      <h3 className="quiz-question-text">
                        {question.question}
                      </h3>

                      {question.type === "multiple-choice" && (
                        <div className="quiz-options">
                          {question.options.map((option, optIndex) => (
                            <label key={optIndex} className="quiz-option">
                              <input
                                type="radio"
                                name={`question-${question.id}`}
                                value={optIndex}
                                checked={
                                  userAnswers[question.id] === String(optIndex)
                                }
                                onChange={(e) =>
                                  handleAnswerChange(
                                    question.id,
                                    e.target.value
                                  )
                                }
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {question.type === "true-false" && (
                        <div className="quiz-options">
                          {(question.options || ["True", "False"]).map(
                            (option, optIndex) => (
                              <label key={optIndex} className="quiz-option">
                                <input
                                  type="radio"
                                  name={`question-${question.id}`}
                                  value={optIndex}
                                  checked={
                                    userAnswers[question.id] ===
                                    String(optIndex)
                                  }
                                  onChange={(e) =>
                                    handleAnswerChange(
                                      question.id,
                                      e.target.value
                                    )
                                  }
                                />
                                <span>{option}</span>
                              </label>
                            )
                          )}
                        </div>
                      )}

                      {question.type === "short-answer" && (
                        <textarea
                          className="quiz-short-answer"
                          placeholder="Type your answer here..."
                          value={userAnswers[question.id] || ""}
                          onChange={(e) =>
                            handleAnswerChange(question.id, e.target.value)
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Right Side - Sticky Sidebar */}
                <div className="quiz-taking-header">
                  {/* Header */}
                  <div className="quiz-info-header">
                    <h3 className="quiz-info-title">Quiz Overview</h3>
                    <p className="quiz-info-subtitle">
                      Track your progress and submit when ready
                    </p>
                  </div>

                  {/* Progress Section */}
                  <div className="quiz-progress">
                    <div className="quiz-progress-info">
                      <span className="quiz-progress-text">Progress</span>
                      <span className="quiz-answered-count">
                        {Object.keys(userAnswers).length}/
                        {currentQuiz.questions.length}
                      </span>
                      <span className="quiz-answered-label">
                        Questions Answered
                      </span>
                    </div>
                    <div className="quiz-progress-bar">
                      <div
                        className="quiz-progress-fill"
                        style={{
                          width: `${
                            (Object.keys(userAnswers).length /
                              currentQuiz.questions.length) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                    <div className="quiz-progress-percentage">
                      {Math.round(
                        (Object.keys(userAnswers).length /
                          currentQuiz.questions.length) *
                          100
                      )}
                      % Complete
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="quiz-stats-grid">
                    <div className="quiz-stat-item">
                      <span className="quiz-stat-value">
                        {currentQuiz.questions.length}
                      </span>
                      <span className="quiz-stat-label">Total Questions</span>
                    </div>
                    <div className="quiz-stat-item">
                      <span className="quiz-stat-value">
                        {currentQuiz.questions.length -
                          Object.keys(userAnswers).length}
                      </span>
                      <span className="quiz-stat-label">Remaining</span>
                    </div>
                  </div>

                  {/* Quiz Details */}
                  <div className="quiz-info-details">
                    <div className="quiz-detail-item">
                      <span className="quiz-detail-label">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        Difficulty
                      </span>
                      <span className="quiz-detail-value">
                        {difficulty.charAt(0).toUpperCase() +
                          difficulty.slice(1)}
                      </span>
                    </div>
                    <div className="quiz-detail-item">
                      <span className="quiz-detail-label">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Total Points
                      </span>
                      <span className="quiz-detail-value">
                        {currentQuiz.questions.reduce(
                          (sum, q) => sum + q.points,
                          0
                        )}
                      </span>
                    </div>
                    <div className="quiz-detail-item">
                      <span className="quiz-detail-label">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                          <polyline points="13 2 13 9 20 9" />
                        </svg>
                        Files Used
                      </span>
                      <span className="quiz-detail-value">
                        {selectedFiles.length}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="quiz-header-actions">
                    <motion.button
                      whileHover={{
                        scale:
                          Object.keys(userAnswers).length ===
                          currentQuiz.questions.length
                            ? 1.02
                            : 1,
                        y:
                          Object.keys(userAnswers).length ===
                          currentQuiz.questions.length
                            ? -2
                            : 0,
                      }}
                      whileTap={{
                        scale:
                          Object.keys(userAnswers).length ===
                          currentQuiz.questions.length
                            ? 0.98
                            : 1,
                      }}
                      className="quiz-submit-button"
                      onClick={handleSubmitQuiz}
                      disabled={
                        Object.keys(userAnswers).length !==
                        currentQuiz.questions.length
                      }
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
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Submit Quiz
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      className="quiz-quit-button"
                      onClick={handleQuit}
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
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      Quit Quiz
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Reviewing/Results State */}
          {quizState === "reviewing" && quizScore && currentQuiz && (
            <motion.div
              key="reviewing"
              className="quiz-results-container"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="quiz-results-layout">
                {/* Left Side - Scrollable Review */}
                <div className="quiz-review-questions">
                  {currentQuiz?.questions?.map((question, index) => {
                    const result = quizScore.results[question.id];
                    return (
                      <div
                        key={question.id}
                        className={`quiz-review-card ${
                          result.isCorrect ? "correct" : "incorrect"
                        }`}
                      >
                        <div className="quiz-review-header">
                          <span className="quiz-question-number">
                            Question {index + 1}
                          </span>
                          <span className="quiz-review-status">
                            {result.isCorrect ? "✓ Correct" : "✗ Incorrect"}
                          </span>
                          <span className="quiz-question-points">
                            {result.isCorrect ? question.points : 0}/
                            {question.points} points
                          </span>
                        </div>
                        <h4 className="quiz-review-question-text">
                          {question.question}
                        </h4>

                        {(question.type === "multiple-choice" ||
                          question.type === "true-false") &&
                          question.options && (
                            <div className="quiz-review-answers">
                              <p>
                                <strong className="answer-label">
                                  Your answer:
                                </strong>{" "}
                                {question.options[
                                  parseInt(result.userAnswer)
                                ] || "Not answered"}
                              </p>
                              {!result.isCorrect && (
                                <p>
                                  <strong className="answer-label correct">
                                    Correct answer:
                                  </strong>{" "}
                                  {question.options[result.correctAnswer]}
                                </p>
                              )}
                            </div>
                          )}

                        {question.type === "short-answer" && (
                          <div className="quiz-review-answers">
                            <p>
                              <strong className="answer-label">
                                Your answer:
                              </strong>{" "}
                              {result.userAnswer || "Not answered"}
                            </p>
                            {!result.isCorrect && (
                              <p>
                                <strong className="answer-label correct">
                                  Correct answer:
                                </strong>{" "}
                                {result.correctAnswer}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="quiz-explanation">
                          <strong className="answer-label">Explanation:</strong>{" "}
                          {result.explanation}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right Side - Sticky Results Panel */}
                <div className="quiz-results-sidebar">
                  {/* Results Header */}
                  <div className="quiz-results-header">
                    <h3>Quiz Complete!</h3>
                    <p>Review your performance</p>
                  </div>

                  {/* Score Display */}
                  <div className="quiz-results-score">
                    <div className="quiz-score-circle">
                      <svg viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="10"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="10"
                          strokeDasharray={`${
                            (quizScore.percentage / 100) * 283
                          } 283`}
                          strokeLinecap="round"
                          transform="rotate(-90 50 50)"
                        />
                      </svg>
                      <div className="quiz-score-text">
                        <span className="score-percentage-large">
                          {quizScore.percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="score-fraction-text">
                      {quizScore.earnedPoints} / {quizScore.totalPoints} points
                    </div>
                  </div>

                  {/* Results Stats */}
                  <div className="quiz-results-stats">
                    <div className="result-stat-item">
                      <span className="stat-value">
                        {quizScore.correctCount || 0}
                      </span>
                      <span className="stat-label">Correct</span>
                    </div>
                    <div className="result-stat-item">
                      <span className="stat-value">
                        {currentQuiz.questions.length -
                          (quizScore.correctCount || 0)}
                      </span>
                      <span className="stat-label">Incorrect</span>
                    </div>
                  </div>

                  {/* Quiz Info */}
                  <div className="quiz-results-info">
                    <div className="result-info-item">
                      <span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        Difficulty
                      </span>
                      <span>
                        {difficulty.charAt(0).toUpperCase() +
                          difficulty.slice(1)}
                      </span>
                    </div>
                    <div className="result-info-item">
                      <span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="6" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        Questions
                      </span>
                      <span>{currentQuiz.questions.length}</span>
                    </div>
                    {selectedFiles && selectedFiles.length > 0 && (
                      <div className="result-info-item files">
                        <span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                            <polyline points="13 2 13 9 20 9" />
                          </svg>
                          Files
                        </span>
                        <span className="files-list">
                          {selectedFiles
                            .map((fileId) => {
                              const file = classData?.files?.find(
                                (f) => f.id === fileId
                              );
                              return file?.name || "Unknown";
                            })
                            .join(", ")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="quiz-results-actions">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="results-action-btn primary"
                      onClick={handleDone}
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
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Done
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="results-action-btn secondary"
                      onClick={handleRetakeWithSameSettings}
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
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      Retake Quiz
                    </motion.button>
                  </div>
                </div>
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
        confirmText="Got it"
        danger={false}
      />

      {/* Delete Quiz Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmDialog.isOpen}
        onClose={() => setDeleteConfirmDialog({ isOpen: false, quizId: null })}
        onConfirm={deleteQuizFromHistory}
        title="Delete Quiz"
        message="Are you sure you want to delete this quiz from your history? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger={true}
      />
    </motion.div>
  );
};

export default QuizComponent;
