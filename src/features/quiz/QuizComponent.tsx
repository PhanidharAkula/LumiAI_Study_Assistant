import { useState, useEffect, type MouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@shared/lib/supabaseClient";
import { fetchStreamingResponse } from "@shared/services/aiService";
import { getFilePublicUrl } from "@shared/utils/storageUtils";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import ConfirmDialog from "@shared/components/ConfirmDialog";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Permissive local shapes for the quiz data model. The AI-generated quiz JSON,
// Supabase rows, and class/file records can't be fully pinned down, so unknown
// fields fall back to `any`.
interface QuizQuestion {
  id: number;
  type: string;
  question: string;
  options?: any[];
  correctAnswer: any;
  explanation: string;
  points: number;
  [key: string]: any;
}

interface Quiz {
  questions: QuizQuestion[];
  difficulty?: string;
  numQuestions?: number;
  selectedFiles?: any[];
  classId?: any;
  className?: string;
  createdAt?: string;
  [key: string]: any;
}

interface QuizResult {
  userAnswer: any;
  isCorrect: boolean;
  correctAnswer: any;
  explanation: string;
  question: string;
  type: string;
  options?: any[];
  points: number;
}

interface QuizScore {
  totalPoints: number;
  earnedPoints: number;
  percentage: number;
  correctCount: number;
  totalQuestions: number;
  results: Record<string, QuizResult>;
}

interface QuizHistoryItem {
  id: any;
  created_at: string;
  quiz_data?: Quiz;
  user_answers?: Record<string, any>;
  score: QuizScore;
  [key: string]: any;
}

interface DebugLog {
  message: string;
  type: string;
  timestamp: string;
}

interface ErrorDialogState {
  isOpen: boolean;
  title: string;
  message: string;
}

interface DeleteConfirmDialogState {
  isOpen: boolean;
  quizId: any;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classData: any;
  _allClasses?: any[];
}

// Tailwind class groups — 1:1 port of QuizComponent.css, kept here so the long
// utility strings aren't repeated across the config cards, buttons, badges, and
// the taking/results panels.
const CONFIG_CARD =
  "bg-white border-[1.5px] border-solid border-ink rounded-[15px] p-5 shadow-[0px_2px_0_#000] h-full max-md:p-3 max-md:rounded-[10px]";
const CONFIG_CARD_HEADER = "flex items-center gap-3 mb-[15px]";
const CONFIG_ICON =
  "w-10 h-10 rounded-[10px] flex items-center justify-center border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000]";
const CONFIG_H3 = "m-0 text-[16px] font-semibold text-ink max-md:text-[14px]";

const DIFF_BTN_BASE =
  "flex items-center gap-3 py-3 px-4 border-[1.5px] border-solid border-ink rounded-xl cursor-pointer shadow-[0px_2px_0_#000] disabled:opacity-50 disabled:cursor-not-allowed max-md:py-3 max-md:px-3.5 max-md:flex-row max-md:justify-start";
const difficultyBtn = (active: boolean) =>
  `${DIFF_BTN_BASE} ${active ? "bg-sage" : "bg-white"}`;
const NUMBER_BTN_BASE =
  "flex flex-col items-center justify-center py-[15px] px-2.5 border-[1.5px] border-solid border-ink rounded-xl cursor-pointer shadow-[0px_2px_0_#000] gap-1 disabled:opacity-50 disabled:cursor-not-allowed max-md:py-2.5 max-md:px-1.5";
const numberBtn = (active: boolean) =>
  `${NUMBER_BTN_BASE} ${active ? "bg-sage" : "bg-white"}`;

const META_BADGE_BASE =
  "flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[12px] font-semibold border-[1.5px] border-solid";

const QUESTION_NUMBER =
  "text-[12px] font-semibold text-muted uppercase tracking-[0.5px] max-md:text-[11px] max-md:py-1 max-md:px-2.5";
const QUESTION_POINTS =
  "text-[14px] font-semibold text-ink bg-sage py-1 px-3 rounded-full max-md:text-[12px] max-md:py-[3px] max-md:px-2.5";
const QUESTION_CARD =
  "bg-white border-[1.5px] border-solid border-ink rounded-2xl p-[25px] shadow-[0px_2px_0_#000] max-md:p-3.5 max-md:rounded-[10px]";

const SUBMIT_QUIT_BASE =
  "w-full flex justify-center items-center gap-2 cursor-pointer text-[14px] font-semibold py-3.5 px-5 rounded-[100px] border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] [transition:transform_0.1s_ease]";
const DETAIL_ITEM =
  "flex justify-between items-center py-2.5 px-3 bg-[#f9fafb] rounded-lg border-[1.5px] border-solid border-ink max-md:py-1.5 max-md:px-2.5";
const DETAIL_LABEL =
  "text-[12px] font-medium text-muted flex items-center gap-1.5 max-md:text-[10px]";
const DETAIL_VALUE =
  "text-[13px] font-semibold text-ink py-[3px] px-2.5 bg-white rounded-md border-[1.5px] border-solid border-ink max-md:text-[11px]";
const STAT_ITEM =
  "flex flex-col items-center gap-[5px] p-3 bg-sage rounded-[10px] border-[1.5px] border-solid border-ink max-md:p-2";
const STAT_VALUE = "text-[20px] font-bold text-ink max-md:text-[18px]";
const STAT_LABEL =
  "text-[10px] font-semibold text-muted uppercase tracking-[0.5px] text-center";
const RESULT_STAT_ITEM =
  "flex flex-col items-center gap-1 p-3 bg-sage rounded-[10px] border-[1.5px] border-solid border-ink max-md:p-2";
const RESULTS_ACTION_BASE =
  "flex items-center justify-center gap-2 py-3 px-[18px] rounded-[100px] text-[13px] font-semibold cursor-pointer border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] max-md:flex-1";

const QUIZ_OPTION =
  "flex items-center gap-3 p-[15px] border-[1.5px] border-solid border-ink rounded-[10px] cursor-pointer [transition:all_0.2s_ease] bg-white hover:bg-sage hover:[transform:translateX(4px)] [&_input]:w-5 [&_input]:h-5 [&_input]:cursor-pointer [&_span]:flex-1 [&_span]:text-[15px] [&_span]:text-ink";
// Sticky right-hand panel (taking + results); hidden on mobile in the original.
const SIDEBAR =
  "self-start sticky top-0 z-50 bg-white border-[1.5px] border-solid border-ink rounded-2xl shadow-[0px_3px_0_#000] flex flex-col h-auto max-h-[calc(100dvh-40px)] box-border overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

const QuizComponent = ({ isOpen, onClose, classData, _allClasses = [] }: Props) => {
  // Quiz configuration
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [numQuestions, setNumQuestions] = useState<number>(10);
  const [selectedFiles, setSelectedFiles] = useState<any[]>([]);

  // Quiz state
  const [quizState, setQuizState] = useState<string>("setup"); // setup, taking, reviewing, completed
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({});
  const [quizScore, setQuizScore] = useState<QuizScore | null>(null);
  const [, setLoading] = useState<boolean>(false);
  const [generatingQuiz, setGeneratingQuiz] = useState<boolean>(false);

  // History - dropdown menu
  const [quizHistory, setQuizHistory] = useState<QuizHistoryItem[]>([]);

  // History dropdown toggle
  const [showHistoryDropdown, setShowHistoryDropdown] = useState<boolean>(false);

  // Debug logs
  const [, setDebugLogs] = useState<DebugLog[]>([]);

  // Error dialog state
  const [errorDialog, setErrorDialog] = useState<ErrorDialogState>({
    isOpen: false,
    title: "",
    message: "",
  });

  // Delete quiz confirmation dialog state
  const [deleteConfirmDialog, setDeleteConfirmDialog] =
    useState<DeleteConfirmDialogState>({
      isOpen: false,
      quizId: null,
    });

  // Helper function to add debug logs
  const addDebugLog = (message: string, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs((prev) => [...prev, { message, type, timestamp }]);
    console.log(`[${timestamp}] ${message}`);
  };

  useEffect(() => {
    if (isOpen && classData) {
      // Load quiz history for this class
      loadQuizHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const extractFileContent = async (file: any) => {
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
        selectedFiles.map(async (fileId: any) => {
          const file = classData.files.find((f: any) => f.id === fileId);
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

      const validContents = fileContents.filter(Boolean) as {
        name: string;
        content: string;
      }[];
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

      const range = (pointRanges as Record<string, { min: number; max: number }>)[
        difficulty
      ];

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

      const aiResult = await fetchStreamingResponse(
        prompt, // userMessage
        "", // context (empty, we already included it in the prompt)
        (chunk) => {
          // onToken callback
          quizData += chunk;
        },
        null as unknown as AbortSignal, // signal
        [], // history
        [] // files
      );

      // If the AI call itself failed (offline, busy, etc.), surface the
      // friendly message rather than mislabeling it as a content/JSON error.
      if (aiResult?.error && aiResult.errorType !== "aborted") {
        setErrorDialog({
          isOpen: true,
          title: "Couldn't generate quiz",
          message: aiResult.error,
        });
        return;
      }

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

      let parsedQuiz: any;
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
        } catch {
          // Log the problematic JSON for debugging
          addDebugLog(`❌ Raw JSON that failed: ${cleanedData}`, "error");
          throw new Error(
            `JSON parsing failed: ${
              parseError instanceof Error ? parseError.message : parseError
            }. The AI response may contain improperly formatted JSON. Please try generating the quiz again.`
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
      parsedQuiz.questions = parsedQuiz.questions.map((q: any, idx: number) => ({
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
      setErrorDialog({
        isOpen: true,
        title: "Quiz Generation Failed",
        message:
          "Couldn't generate the quiz from these materials right now. Please try again in a moment.",
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

  const handleAnswerChange = (questionId: any, answer: any) => {
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
    const results: Record<string, QuizResult> = {};

    currentQuiz.questions.forEach((question: QuizQuestion) => {
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
      correctCount: Object.values(results).filter((r) => r.isCorrect)
        .length,
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

  const loadQuizFromHistory = (historyItem: QuizHistoryItem) => {
    console.log("Loading quiz from history:", historyItem);

    // Restore quiz data
    setCurrentQuiz(historyItem.quiz_data as Quiz | null);
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

  const handleDeleteClick = (e: MouseEvent, quizId: any) => {
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
      className="fixed inset-0 bg-transparent z-[1000] flex flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Modern Header */}
      <div className="py-5 px-[30px] flex items-center gap-5 relative z-[100] max-md:py-2.5 max-md:px-3.5 max-md:sticky max-md:top-0 max-md:bg-white max-[480px]:py-2.5 max-[480px]:px-3">
        <motion.button
          className="h-[50px] w-[50px] rounded-full flex justify-center items-center bg-sage shadow-[0px_2px_0_#000] border-[1.5px] border-solid border-ink text-[xx-large] cursor-pointer p-2.5 max-md:w-9 max-md:h-9"
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
        <div className="flex-1 flex items-center">
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
          <div>
            <h1 className="m-0 text-[x-large] font-semibold text-ink max-md:text-[16px] max-[360px]:text-[14px]">
              {classData?.name}
            </h1>
            <p className="mt-1 mx-0 mb-0 text-[small] text-muted max-md:text-[11px] max-[480px]:hidden">
              Interactive Quiz Session
            </p>
          </div>
        </div>

        {/* History Dropdown Button */}
        <div className="relative">
          <motion.button
            className="flex items-center gap-2 py-2.5 px-4 rounded-[100px] bg-sage border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] cursor-pointer text-ink font-medium text-[14px] relative max-md:w-9 max-md:h-9 max-md:p-0 max-md:justify-center"
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
            <span className="font-semibold max-md:hidden">History</span>
          </motion.button>

          {/* Dropdown Overlay - closes dropdown when clicking outside */}
          {showHistoryDropdown && (
            <div
              className="fixed inset-0 bg-transparent z-[999]"
              onClick={() => setShowHistoryDropdown(false)}
            />
          )}

          {/* History Dropdown Menu */}
          <AnimatePresence>
            {showHistoryDropdown && (
              <motion.div
                className="absolute top-[calc(100%+10px)] right-0 w-[420px] max-h-[80dvh] bg-white border-[1.5px] border-solid border-ink rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.15)] z-[1000] overflow-hidden flex flex-col max-[1024px]:w-[380px] max-md:w-[90vw] max-md:max-w-[340px]"
                onClick={(e) => e.stopPropagation()} // Prevent clicks from bubbling to overlay
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <div className="p-5 bg-[#dbeafe] border-0 border-b-[1.5px] border-solid border-ink flex items-center justify-between">
                  <h3 className="m-0 text-[large] font-semibold text-ink">
                    Quiz History
                  </h3>
                  <span className="py-1.5 px-3 bg-sage text-ink text-[14px] font-semibold rounded-lg border-[1.5px] border-solid border-ink">
                    {quizHistory.length}{" "}
                    {quizHistory.length === 1 ? "quiz" : "quizzes"}
                  </span>
                </div>

                <div className="p-4 overflow-y-auto max-h-[calc(80dvh-100px)] flex flex-col gap-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                          className="bg-white border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] rounded-[15px] p-[15px] cursor-pointer relative overflow-visible"
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
                          <div className="flex justify-between items-center mb-[15px]">
                            <div className="flex items-center gap-1.5 py-1.5 px-3 bg-[#f3f4f6] rounded-lg text-[12px] font-semibold text-muted">
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
                              className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#fee2e2] border-[1.5px] border-solid border-[#ef4444] cursor-pointer"
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

                          <div className="flex items-center gap-4 p-3 bg-[#dcfce7] rounded-xl mb-3">
                            <div className="relative w-[55px] h-[55px] shrink-0">
                              <svg
                                viewBox="0 0 36 36"
                                className="block max-w-full max-h-full"
                              >
                                <path
                                  className="[fill:none] [stroke:#e5e7eb] [stroke-width:3]"
                                  d="M18 2.0845
                                    a 15.9155 15.9155 0 0 1 0 31.831
                                    a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                                <path
                                  className="[fill:none] [stroke:#10b981] [stroke-width:3] [stroke-linecap:round] [animation:progress_1s_ease-out_forwards]"
                                  strokeDasharray={`${item.score.percentage}, 100`}
                                  d="M18 2.0845
                                    a 15.9155 15.9155 0 0 1 0 31.831
                                    a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                              </svg>
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] font-medium text-ink">
                                {item.score.percentage}%
                              </div>
                            </div>

                            <div className="flex-1 flex flex-col gap-0.5">
                              <div className="text-[small] uppercase text-muted font-medium">
                                Score
                              </div>
                              <div className="text-[medium] font-medium text-ink">
                                {item.score.correctCount}/{numQuestions}
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 mb-2.5 flex-wrap">
                            <span
                              className={`${META_BADGE_BASE} bg-[#fef3c7] border-[#f59e0b] text-[#d97706]`}
                            >
                              <span className="text-[14px]">
                                {difficultyEmoji}
                              </span>
                              {difficulty}
                            </span>
                            <span
                              className={`${META_BADGE_BASE} bg-[#dbeafe] border-[#3b82f6] text-[#1d4ed8]`}
                            >
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
                            <div className="flex items-start gap-2 p-2.5 bg-[#f3f4f6] rounded-lg text-[11px] text-muted leading-[1.4] [&_svg]:shrink-0">
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
                                  .map((fileId: any) => {
                                    const file = classData?.files?.find(
                                      (f: any) => f.id === fileId
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
                    <div className="flex flex-col items-center justify-center py-[60px] px-[30px] text-center gap-3">
                      <div className="w-20 h-20 rounded-full bg-[linear-gradient(135deg,#f0f9ff_0%,#e0f2fe_100%)] flex items-center justify-center mb-2 text-[#3b82f6] opacity-60">
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
                      <p className="m-0 text-[16px] font-semibold text-ink">
                        No History Yet
                      </p>
                      <span className="text-[13px] text-muted">
                        Your quiz attempts will appear here
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* quiz-content-area class kept as a querySelector hook (scroll-to-top) */}
      <div className="quiz-content-area flex-1 min-h-0 overflow-y-auto [-webkit-overflow-scrolling:touch] p-5 bg-transparent flex flex-col max-md:p-0">
        <AnimatePresence mode="wait">
          {/* Setup State */}
          {quizState === "setup" && !generatingQuiz && (
            <motion.div
              key="setup"
              className="w-full max-w-[1400px] m-auto flex flex-col gap-5 p-0 h-auto justify-center max-[1024px]:max-w-[700px] max-[1024px]:p-[15px] max-md:max-w-full max-md:p-3 max-md:overflow-y-auto"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              {/* Configuration Cards Grid */}
              <div className="grid grid-cols-3 grid-rows-[1fr_1fr] gap-[15px] items-stretch mb-5 flex-1 max-[1024px]:gap-5 max-md:flex max-md:flex-col max-md:gap-3">
                {/* Header Section */}
                <div className="text-center py-[30px] px-5 bg-[#dbeafe] rounded-[20px] border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] relative overflow-hidden col-[1/3] row-[1] flex flex-col justify-center max-md:py-4 max-md:px-3 max-md:rounded-[10px] before:content-[''] before:absolute before:top-[-50%] before:right-[-50%] before:w-[200%] before:h-[200%] before:bg-[radial-gradient(circle,rgba(255,255,255,0.3)_0%,transparent_70%)] before:pointer-events-none">
                  <motion.div
                    className="w-[70px] h-[70px] mt-0 mx-auto mb-5 bg-white rounded-full flex items-center justify-center border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] text-ink max-md:w-10 max-md:h-10"
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
                  <h2 className="mt-0 mx-0 mb-2.5 text-[x-large] font-semibold text-ink max-md:text-[18px]">
                    Create Your Quiz
                  </h2>
                  <p className="m-0 text-[medium] text-muted max-md:text-[12px]">
                    Customize difficulty, length, and source materials
                  </p>
                </div>

                {/* Difficulty Card */}
                <motion.div
                  className={`${CONFIG_CARD} col-[1] row-[2]`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
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
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </div>
                    <h3 className={CONFIG_H3}>Difficulty Level</h3>
                  </div>
                  <div className="flex flex-col gap-2.5">
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
                        className={difficultyBtn(difficulty === level)}
                        onClick={() => setDifficulty(level)}
                        disabled={generatingQuiz}
                        whileHover={{ scale: 1.04, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="text-[20px] shrink-0">{icon}</span>
                        <span className="flex-1 text-[14px] font-medium text-ink text-left">
                          {label}
                        </span>
                        <span className="text-[12px] text-muted bg-black/[0.08] py-[3px] px-2 rounded-full">
                          {desc}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {/* Number of Questions Card */}
                <motion.div
                  className={`${CONFIG_CARD} col-[2] row-[2]`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className={CONFIG_CARD_HEADER}>
                    <div className={`${CONFIG_ICON} bg-[#bfdbfe] text-[#1d4ed8]`}>
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
                    <h3 className={CONFIG_H3}>Number of Questions</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 max-md:gap-2 max-[480px]:grid-cols-2">
                    {[10, 20, 30, 40, 50, 100].map((num) => (
                      <motion.button
                        key={num}
                        className={numberBtn(numQuestions === num)}
                        onClick={() => setNumQuestions(num)}
                        disabled={generatingQuiz}
                        whileHover={{ scale: 1.05, y: -3 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="text-[20px] font-medium text-ink max-md:text-[18px]">
                          {num}
                        </span>
                        <span className="text-[10px] text-muted uppercase">
                          questions
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {/* Files Selection Card */}
                <motion.div
                  className="bg-white border-[1.5px] border-solid border-ink rounded-[15px] p-5 shadow-[0px_2px_0_#000] h-full flex flex-col col-[3] row-[1/3] max-md:p-3 max-md:rounded-[10px]"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
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
                        <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                        <polyline points="13 2 13 9 20 9" />
                      </svg>
                    </div>
                    <div className="flex-1 flex justify-between items-center">
                      <h3 className={CONFIG_H3}>Select Source Files</h3>
                      <span className="text-[13px] font-semibold text-ink bg-sage py-1 px-3 rounded-full border-[1.5px] border-solid border-ink">
                        {selectedFiles.length} selected
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 auto-rows-min max-h-full overflow-y-auto p-[5px] flex-1 content-start [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-[1024px]:gap-3 max-md:grid-cols-1 max-md:gap-2">
                    {classData?.files && classData.files.length > 0 ? (
                      classData.files.map((file: any, index: number) => (
                        <motion.label
                          key={file.id}
                          className="relative flex justify-center items-center gap-2.5 py-2.5 px-3 border-[1.5px] border-solid border-ink rounded-[10px] bg-white cursor-pointer shadow-[0px_2px_0_#000] h-auto"
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
                          <div className="shrink-0 w-8 h-8 rounded-lg bg-sage flex items-center justify-center text-ink">
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
                          <div className="flex-1 min-w-0 flex flex-col">
                            <span className="text-[13px] font-semibold text-ink overflow-hidden text-ellipsis whitespace-nowrap">
                              {file.name}
                            </span>
                            <span className="text-[10px] text-muted uppercase font-semibold tracking-[0.5px]">
                              {file.name.split(".").pop()?.toUpperCase()}
                            </span>
                          </div>
                          <div
                            className={`shrink-0 w-5 h-5 rounded-full border-[1.5px] border-solid border-ink flex items-center justify-center text-transparent ${
                              selectedFiles.includes(file.id)
                                ? "bg-sage"
                                : "bg-white"
                            }`}
                          >
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
                      <div className="col-[1/-1] flex flex-col items-center justify-center py-[60px] px-5 text-center gap-3 text-muted [&_svg]:opacity-30">
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
                        <p className="m-0 text-[16px] font-semibold text-ink">
                          No files available in this class
                        </p>
                        <span className="text-[14px] text-muted">
                          Upload files to create quizzes
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Generate Button */}
              <motion.button
                className="w-fit mx-auto flex justify-center items-center gap-2.5 cursor-pointer text-[medium] font-semibold py-3 px-[30px] rounded-[100px] bg-sage border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] text-ink disabled:opacity-70 disabled:cursor-not-allowed [&_svg]:w-5 [&_svg]:h-5"
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
              className="my-auto w-full max-w-[50%] flex flex-col gap-[30px] max-[1024px]:max-w-[700px] max-md:max-w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex flex-col items-center justify-center gap-5 text-center w-full">
                <div className="w-[60px] h-[60px] border-4 border-solid border-black/10 rounded-full border-t-ink [animation:spin_1s_ease-in-out_infinite]"></div>
                <h2 className="m-0 text-[24px] text-ink">
                  Generating Your Quiz...
                </h2>
                <p className="m-0 text-[14px] text-muted">
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
                  className="mt-5 py-3 px-[30px] rounded-[100px] text-[14px] font-semibold cursor-pointer bg-white border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] text-ink min-w-[120px]"
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
              className="mx-0 my-auto w-full max-w-full h-full p-0 flex flex-col overflow-hidden max-md:h-auto max-md:overflow-y-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="grid grid-cols-[1fr_400px] gap-5 h-full w-full max-w-full m-0 py-5 px-[30px] items-start overflow-hidden box-border max-[1024px]:grid-cols-[1fr_320px] max-[1024px]:p-5 max-[1024px]:gap-[15px] max-md:flex max-md:flex-col max-md:h-auto max-md:p-0 max-md:gap-0 max-md:after:content-[''] max-md:after:fixed max-md:after:bottom-0 max-md:after:left-0 max-md:after:right-0 max-md:after:h-[70px] max-md:after:bg-white max-md:after:border-0 max-md:after:border-t-[1.5px] max-md:after:border-solid max-md:after:border-ink max-md:after:z-[90] max-md:after:pointer-events-none">
                {/* Left Side - Scrollable Questions */}
                <div className="flex flex-col gap-5 pb-10 overflow-y-auto h-[calc(100dvh-132px)] pr-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-md:w-full max-md:h-auto max-md:p-3 max-md:pb-20 max-md:overflow-y-visible max-md:gap-3">
                  {currentQuiz.questions.map((question, index) => (
                    <div key={question.id} className={QUESTION_CARD}>
                      <div className="flex justify-between items-center mb-[15px] max-md:mb-3">
                        <span className={QUESTION_NUMBER}>
                          Question {index + 1}
                        </span>
                        <span className={QUESTION_POINTS}>
                          {question.points} points
                        </span>
                      </div>
                      <h3 className="mt-0 mx-0 mb-5 text-[18px] leading-[1.6] text-ink max-md:text-[14px] max-md:mb-3">
                        {question.question}
                      </h3>

                      {question.type === "multiple-choice" && (
                        <div className="flex flex-col gap-3 max-md:gap-2">
                          {(question.options as any[]).map(
                            (option: any, optIndex: number) => (
                            <label key={optIndex} className={QUIZ_OPTION}>
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
                        <div className="flex flex-col gap-3 max-md:gap-2">
                          {(question.options || ["True", "False"]).map(
                            (option, optIndex) => (
                              <label key={optIndex} className={QUIZ_OPTION}>
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
                          className="w-full min-h-[100px] p-[15px] border-[1.5px] border-solid border-ink rounded-[10px] text-[15px] font-[inherit] resize-y [transition:all_0.2s_ease] focus:outline-none focus:shadow-[0_0_0_3px_rgba(0,0,0,0.1)] max-md:p-2.5 max-md:text-[14px] max-md:min-h-20"
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
                <div className={`${SIDEBAR} p-5 gap-[18px] max-[1024px]:p-4 max-[1024px]:gap-3.5 max-md:hidden`}>
                  {/* Header */}
                  <div className="text-center pb-[15px] border-0 border-b-[1.5px] border-solid border-ink">
                    <h3 className="text-[16px] font-semibold text-ink mt-0 mx-0 mb-1.5">
                      Quiz Overview
                    </h3>
                    <p className="text-[12px] text-muted m-0">
                      Track your progress and submit when ready
                    </p>
                  </div>

                  {/* Progress Section */}
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-[12px] font-semibold text-muted uppercase tracking-[0.5px]">
                        Progress
                      </span>
                      <span className="text-[36px] font-bold text-ink leading-none">
                        {Object.keys(userAnswers).length}/
                        {currentQuiz.questions.length}
                      </span>
                      <span className="text-[13px] font-medium text-muted">
                        Questions Answered
                      </span>
                    </div>
                    <div className="w-full h-3 bg-[#f3f4f6] border-[1.5px] border-solid border-ink rounded-full overflow-hidden">
                      <div
                        className="h-full bg-ink [transition:width_0.3s_ease] rounded-full"
                        style={{
                          width: `${
                            (Object.keys(userAnswers).length /
                              currentQuiz.questions.length) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                    <div className="text-center text-[14px] font-semibold text-ink mt-1.5">
                      {Math.round(
                        (Object.keys(userAnswers).length /
                          currentQuiz.questions.length) *
                          100
                      )}
                      % Complete
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2.5 py-[15px] border-0 border-y-[1.5px] border-solid border-ink">
                    <div className={STAT_ITEM}>
                      <span className={STAT_VALUE}>
                        {currentQuiz.questions.length}
                      </span>
                      <span className={STAT_LABEL}>Total Questions</span>
                    </div>
                    <div className={STAT_ITEM}>
                      <span className={STAT_VALUE}>
                        {currentQuiz.questions.length -
                          Object.keys(userAnswers).length}
                      </span>
                      <span className={STAT_LABEL}>Remaining</span>
                    </div>
                  </div>

                  {/* Quiz Details */}
                  <div className="flex flex-col gap-2.5">
                    <div className={DETAIL_ITEM}>
                      <span className={DETAIL_LABEL}>
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
                      <span className={DETAIL_VALUE}>
                        {difficulty.charAt(0).toUpperCase() +
                          difficulty.slice(1)}
                      </span>
                    </div>
                    <div className={DETAIL_ITEM}>
                      <span className={DETAIL_LABEL}>
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
                      <span className={DETAIL_VALUE}>
                        {currentQuiz.questions.reduce(
                          (sum, q) => sum + q.points,
                          0
                        )}
                      </span>
                    </div>
                    <div className={DETAIL_ITEM}>
                      <span className={DETAIL_LABEL}>
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
                      <span className={DETAIL_VALUE}>
                        {selectedFiles.length}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2.5 pt-[5px]">
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
                      className={`${SUBMIT_QUIT_BASE} bg-sage text-ink disabled:opacity-50 disabled:cursor-not-allowed`}
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
                      className={`${SUBMIT_QUIT_BASE} bg-white text-ink`}
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
              className="mx-0 my-auto w-full max-w-full h-full p-0 flex flex-col overflow-hidden max-md:h-auto max-md:overflow-y-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="grid grid-cols-[1fr_400px] gap-5 h-full w-full max-w-full m-0 py-5 px-[30px] items-start overflow-hidden box-border max-[1024px]:grid-cols-[1fr_320px] max-[1024px]:p-5 max-[1024px]:gap-[15px] max-md:flex max-md:flex-col max-md:h-auto max-md:p-3 max-md:gap-3">
                {/* Left Side - Scrollable Review */}
                <div className="flex flex-col gap-5 pb-[60px] overflow-y-auto h-[calc(100dvh-132px)] pr-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-md:w-full max-md:h-auto max-md:p-0 max-md:gap-2.5 max-md:overflow-y-visible max-[480px]:p-3">
                  {currentQuiz?.questions?.map((question, index) => {
                    const result = quizScore.results[question.id];
                    return (
                      <div
                        key={question.id}
                        className={`rounded-2xl p-[25px] ${
                          result.isCorrect
                            ? "border-[1.5px] border-solid border-[#10b981] shadow-[0px_2px_0_#10b981] bg-[#f0fdf4]"
                            : "border-[1.5px] border-solid border-[#ef4444] shadow-[0px_2px_0_#ef4444] bg-[#fef2f2]"
                        }`}
                      >
                        <div className="flex justify-between items-center mb-[15px] flex-wrap gap-2.5">
                          <span className={QUESTION_NUMBER}>
                            Question {index + 1}
                          </span>
                          <span
                            className={`text-[14px] font-medium py-1 px-3 rounded-full ${
                              result.isCorrect
                                ? "bg-[#10b981] text-white"
                                : "bg-[#ef4444] text-white"
                            }`}
                          >
                            {result.isCorrect ? "✓ Correct" : "✗ Incorrect"}
                          </span>
                          <span className={QUESTION_POINTS}>
                            {result.isCorrect ? question.points : 0}/
                            {question.points} points
                          </span>
                        </div>
                        <h4 className="mt-0 mx-0 mb-[15px] text-[18px] leading-[1.6] text-ink">
                          {question.question}
                        </h4>

                        {(question.type === "multiple-choice" ||
                          question.type === "true-false") &&
                          question.options && (
                            <div className="my-[15px] p-[15px] bg-black/[0.06] rounded-lg [&_p]:my-2 [&_p]:mx-0 [&_p]:text-[14px] [&_p]:text-ink">
                              <p>
                                <strong className="font-semibold text-ink">
                                  Your answer:
                                </strong>{" "}
                                {question.options[
                                  parseInt(result.userAnswer)
                                ] || "Not answered"}
                              </p>
                              {!result.isCorrect && (
                                <p>
                                  <strong className="font-semibold text-[#10b981]">
                                    Correct answer:
                                  </strong>{" "}
                                  {question.options[result.correctAnswer]}
                                </p>
                              )}
                            </div>
                          )}

                        {question.type === "short-answer" && (
                          <div className="my-[15px] p-[15px] bg-black/[0.06] rounded-lg [&_p]:my-2 [&_p]:mx-0 [&_p]:text-[14px] [&_p]:text-ink">
                            <p>
                              <strong className="font-semibold text-ink">
                                Your answer:
                              </strong>{" "}
                              {result.userAnswer || "Not answered"}
                            </p>
                            {!result.isCorrect && (
                              <p>
                                <strong className="font-semibold text-[#10b981]">
                                  Correct answer:
                                </strong>{" "}
                                {result.correctAnswer}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="mt-[15px] p-[15px] bg-black/[0.06] rounded-lg text-[14px] text-ink leading-[1.6]">
                          <strong className="font-semibold text-ink">
                            Explanation:
                          </strong>{" "}
                          {result.explanation}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right Side - Sticky Results Panel */}
                <div className={`${SIDEBAR} p-[18px] gap-[15px] max-[1024px]:p-4 max-[1024px]:gap-3 max-md:static max-md:w-full max-md:p-3.5 max-md:rounded-[10px] max-md:gap-2.5 max-[480px]:px-3 max-[480px]:py-2.5 max-[480px]:top-[55px]`}>
                  {/* Results Header */}
                  <div className="text-center p-3 bg-[#dcfce7] rounded-xl border-[1.5px] border-solid border-ink max-md:p-2.5 max-md:rounded-lg">
                    <h3 className="m-0 text-[16px] font-bold text-ink max-md:text-[13px]">
                      Quiz Complete!
                    </h3>
                    <p className="mt-1 mx-0 mb-0 text-[11px] text-muted max-md:text-[10px]">
                      Review your performance
                    </p>
                  </div>

                  {/* Score Display */}
                  <div className="flex flex-col items-center gap-2.5 p-[15px] bg-white rounded-xl max-md:py-3 max-md:px-0">
                    <div className="w-[120px] h-[120px] relative">
                      <svg
                        viewBox="0 0 100 100"
                        className="w-full h-full max-[1024px]:w-[100px] max-[1024px]:h-[100px] max-md:w-20 max-md:h-20"
                      >
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
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                        <span className="text-[28px] font-bold text-ink">
                          {quizScore.percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="text-[13px] font-semibold text-muted">
                      {quizScore.earnedPoints} / {quizScore.totalPoints} points
                    </div>
                  </div>

                  {/* Results Stats */}
                  <div className="grid grid-cols-2 gap-2 p-0 max-md:py-2.5 max-md:px-0">
                    <div className={RESULT_STAT_ITEM}>
                      <span className="text-[22px] font-bold text-ink">
                        {quizScore.correctCount || 0}
                      </span>
                      <span className="text-[10px] font-semibold text-muted uppercase">
                        Correct
                      </span>
                    </div>
                    <div className={RESULT_STAT_ITEM}>
                      <span className="text-[22px] font-bold text-ink">
                        {currentQuiz.questions.length -
                          (quizScore.correctCount || 0)}
                      </span>
                      <span className="text-[10px] font-semibold text-muted uppercase">
                        Incorrect
                      </span>
                    </div>
                  </div>

                  {/* Quiz Info */}
                  <div className="flex flex-col gap-1.5 p-3 bg-[#f9fafb] rounded-[10px] border-[1.5px] border-solid border-ink">
                    <div className="flex justify-between items-center py-[7px] px-2.5 bg-white rounded-lg text-[12px] [&>span:first-child]:flex [&>span:first-child]:items-center [&>span:first-child]:gap-1.5 [&>span:first-child]:text-muted [&>span:first-child]:font-semibold [&>span:last-child]:text-ink [&>span:last-child]:font-semibold">
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
                    <div className="flex justify-between items-center py-[7px] px-2.5 bg-white rounded-lg text-[12px] [&>span:first-child]:flex [&>span:first-child]:items-center [&>span:first-child]:gap-1.5 [&>span:first-child]:text-muted [&>span:first-child]:font-semibold [&>span:last-child]:text-ink [&>span:last-child]:font-semibold">
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
                      <div className="flex flex-col items-start gap-1.5 py-[7px] px-2.5 bg-white rounded-lg text-[12px] [&>span:first-child]:flex [&>span:first-child]:items-center [&>span:first-child]:gap-1.5 [&>span:first-child]:text-muted [&>span:first-child]:font-semibold">
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
                        <span className="text-[11px] text-muted leading-[1.4] font-medium">
                          {selectedFiles
                            .map((fileId: any) => {
                              const file = classData?.files?.find(
                                (f: any) => f.id === fileId
                              );
                              return file?.name || "Unknown";
                            })
                            .join(", ")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2 pt-[5px] max-md:flex-row max-md:gap-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`${RESULTS_ACTION_BASE} bg-sage text-ink`}
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
                      className={`${RESULTS_ACTION_BASE} bg-white text-ink`}
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
