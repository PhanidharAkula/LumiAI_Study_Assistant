import {
  useState,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@shared/lib/supabaseClient";
import { fetchStreamingResponse } from "@shared/services/aiService";
import ConfirmDialog from "@shared/components/ConfirmDialog";
import {
  Constellation,
  CornerTicks,
  Starfield,
  UI,
  hashSeed,
  mulberry32,
  starPath,
} from "@shared/components/atlas";
import { BackButton, Button, IconButton } from "@shared/components/controls";
import { PageBackdrop } from "@shared/components/PageBackdrop";
import { fadeRise, pressLift, stagger } from "@shared/motion";
import { useEscapeToClose, useScrollLock } from "@shared/hooks/overlay";
import { resolveStudyFiles } from "@features/study/resolveStudyFiles";
import { isSupportedForAI } from "@shared/lib/fileExtract";
import GeneratingState from "@features/study/GeneratingState";
import FileSelectionCard from "@features/study/FileSelectionCard";
import HistoryDropdown from "@features/study/HistoryDropdown";
import StudyErrorDialog, {
  type StudyErrorState,
} from "@features/study/StudyErrorDialog";

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

interface DeleteConfirmDialogState {
  isOpen: boolean;
  quizId: any;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classData: any;
}

// Tailwind class groups - The Luminarium "expedition" vocabulary. Setup is a
// parchment planning desk, taking the quiz is a night chart, and results are
// the user's own constellation. Tailwind v4 can't resolve conflicting
// utilities by class order, so selected/correct states are variant strings.

/* ── Setup (parchment) ─────────────────────────────────────────────────── */
const CONFIG_CARD = `${UI.plate} h-full p-5 max-md:rounded-[10px] max-md:p-4`;
const CONFIG_CARD_HEADER = "mb-4 flex items-center gap-3";
const CONFIG_H3 = `m-0 ${UI.overline}`;

const CHOICE_PILL_BASE =
  "flex items-center gap-3 rounded-full border border-solid px-4 py-3 cursor-pointer transition-[color,background-color,border-color,box-shadow] duration-200 disabled:opacity-50 disabled:cursor-default max-md:py-2.5 max-md:px-3.5 max-md:flex-row max-md:justify-start";
const difficultyBtn = (active: boolean) =>
  `${CHOICE_PILL_BASE} ${
    active
      ? "border-ink bg-ink text-cream"
      : "border-ink/25 bg-transparent text-ink hover:border-ink"
  }`;
const NUMBER_BTN_BASE =
  "relative flex flex-col items-center justify-center gap-0.5 rounded-xl border border-solid py-3.75 px-2.5 cursor-pointer transition-[color,background-color,border-color,box-shadow] duration-200 disabled:opacity-50 disabled:cursor-default max-md:py-2.5 max-md:px-1.5";
const numberBtn = (active: boolean) =>
  `${NUMBER_BTN_BASE} ${
    active
      ? "border-ink bg-ink text-cream after:absolute after:right-2 after:top-1.5 after:text-[9px] after:leading-none after:text-gold after:content-['✦']"
      : "border-ink/25 bg-transparent text-ink hover:border-ink"
  }`;

/* ── Taking the quiz (night chart) ─────────────────────────────────────── */
const QUESTION_CARD =
  "relative rounded-xl border border-solid border-line-night bg-night-2 p-6.25 shadow-night max-md:p-4 max-md:rounded-[10px]";
const QUIZ_OPTION_BASE =
  "flex items-center gap-3 p-3.75 rounded-[10px] border border-solid cursor-pointer transition-colors duration-200 [&_input]:h-4.5 [&_input]:w-4.5 [&_input]:shrink-0 [&_input]:cursor-pointer [&_input]:accent-gold [&_span]:flex-1 [&_span]:text-[15px]";
const quizOption = (checked: boolean) =>
  `${QUIZ_OPTION_BASE} ${
    checked
      ? "border-gold bg-gold/10 [&_span]:text-starlight after:text-[12px] after:leading-none after:text-gold after:content-['✦']"
      : "border-line-night bg-transparent hover:border-starlight/40 [&_span]:text-starlight/85"
  }`;
const QUIZ_TEXTAREA =
  "w-full min-h-25 p-3.75 rounded-[10px] border border-solid border-line-night bg-night/40 text-[15px] font-[inherit] text-starlight resize-y transition-colors placeholder:text-starlight/40 focus:border-gold focus:outline-none max-md:p-2.5 max-md:text-[14px] max-md:min-h-20";

// Sticky right-hand panel (taking + results). While taking, it stays hidden on
// ≤768px (pre-existing quirk - the fixed bottom bar carries Submit/Quit there).
const SIDEBAR =
  "self-start sticky top-0 z-50 flex flex-col h-auto max-h-[calc(100dvh-40px)] box-border overflow-y-auto rounded-xl border border-solid border-line-night text-starlight shadow-night scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

const STAT_ITEM =
  "flex flex-col items-center gap-1 rounded-lg border border-solid border-line-night bg-starlight/4 p-3 max-md:p-2";
const STAT_LABEL =
  "text-center font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-starlight/50";
const STAT_VALUE =
  "font-display text-[22px] font-semibold leading-tight text-starlight max-md:text-[18px]";

const DETAIL_ITEM =
  "flex justify-between items-center py-2 px-3 rounded-lg border border-solid border-line-night bg-starlight/3 max-md:py-1.5 max-md:px-2.5";
const DETAIL_LABEL =
  "flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-starlight/55";
const DETAIL_VALUE =
  "text-[13px] font-semibold text-starlight max-md:text-[11px]";

// Results-panel info rows (night): mono label left, starlight value right.
const INFO_ROW =
  "flex justify-between items-center py-1.5 text-[12px] [&>span:first-child]:flex [&>span:first-child]:items-center [&>span:first-child]:gap-1.5 [&>span:first-child]:font-mono [&>span:first-child]:text-[10px] [&>span:first-child]:font-medium [&>span:first-child]:uppercase [&>span:first-child]:tracking-[0.14em] [&>span:first-child]:text-starlight/55 [&>span:last-child]:text-starlight [&>span:last-child]:font-semibold";
const INFO_ROW_STACK =
  "flex flex-col items-start gap-1.5 py-1.5 text-[12px] [&>span:first-child]:flex [&>span:first-child]:items-center [&>span:first-child]:gap-1.5 [&>span:first-child]:font-mono [&>span:first-child]:text-[10px] [&>span:first-child]:font-medium [&>span:first-child]:uppercase [&>span:first-child]:tracking-[0.14em] [&>span:first-child]:text-starlight/55";

// Starlight ghost + the vermilion "abandon expedition" key (AA on night).
const NIGHT_GHOST_BTN =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-solid border-starlight/30 bg-transparent text-starlight transition-colors duration-200 hover:border-starlight/70 hover:bg-starlight/10";
const NIGHT_QUIT_BTN =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-solid border-[#e2674a]/60 bg-transparent text-[#ff9c82] transition-colors duration-200 hover:border-[#e2674a] hover:bg-[#b23a1d] hover:text-white";

/* ── Reviewing (parchment ledger, red/green margin bars) ───────────────── */
const QUESTION_NUMBER =
  "font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted";
const QUESTION_POINTS =
  "font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted";
const reviewCard = (correct: boolean) =>
  `relative rounded-xl border border-solid border-line border-l-4 bg-vellum p-6.25 shadow-plate max-md:p-4 max-md:rounded-[10px] ${
    correct ? "border-l-verdi" : "border-l-vermilion"
  }`;
const reviewBadge = (correct: boolean) =>
  `rounded-full border border-solid px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] ${
    correct
      ? "border-verdi/40 bg-sage/30 text-verdi"
      : "border-vermilion/40 bg-vermilion-wash text-vermilion"
  }`;
const REVIEW_WASH = "rounded-lg bg-ink/4 p-3.75";

/* ── History (ledger rows) ─────────────────────────────────────────────── */
const HISTORY_ROW =
  "group relative flex cursor-pointer items-center gap-3.5 rounded-lg border border-solid border-line bg-transparent px-3.5 py-3 transition-colors duration-200 hover:border-ink/40 hover:bg-cream/60";

/**
 * "Your constellation" - the results chart. One star per question, laid out
 * deterministically from the quiz's own question texts (FNV-1a hash →
 * mulberry32), so the same expedition always draws the same sky - never
 * Math.random/Date.now. Correct answers become gold twinkling stars joined by
 * a dotted route that draws itself in; misses stay dim, unconnected ring stars.
 */
const ResultsConstellation = ({
  questions,
  results,
}: {
  questions: QuizQuestion[];
  results: Record<string, QuizResult>;
}) => {
  const stars = useMemo(() => {
    const rand = mulberry32(
      hashSeed(questions.map((q) => q.question).join("|") || "expedition")
    );
    const n = questions.length;
    // Stars pack tighter as expeditions grow (5-50 questions).
    const minDist = Math.max(4, 26 / Math.sqrt(Math.max(n, 1)));
    const pts: { x: number; y: number; r: number }[] = [];
    let guard = 0;
    while (pts.length < n && guard++ < n * 80) {
      const x = 7 + rand() * 86;
      const y = 9 + rand() * 44;
      if (pts.every((p) => Math.hypot(p.x - x, p.y - y) > minDist)) {
        pts.push({ x, y, r: 1.6 + rand() * 1.2 });
      }
    }
    while (pts.length < n) {
      // Very dense skies: relax the spacing rule rather than drop a star.
      pts.push({ x: 7 + rand() * 86, y: 9 + rand() * 44, r: 1.5 });
    }
    return pts;
  }, [questions]);

  const charted = questions.map((q, i) => ({
    pt: stars[i]!,
    correct: !!results[q.id]?.isCorrect,
  }));
  const route = charted.filter((s) => s.correct);
  const routeD = route
    .map(
      (s, i) =>
        `${i === 0 ? "M" : "L"} ${s.pt.x.toFixed(1)} ${s.pt.y.toFixed(1)}`
    )
    .join(" ");

  return (
    <svg viewBox="0 0 100 62" className="block w-full" aria-hidden="true">
      {route.length >= 2 && (
        <>
          <defs>
            {/* A dashed stroke can't pathLength-draw directly, so the dotted
                route is revealed by a solid stroke drawing across this mask. */}
            <mask id="quiz-route-reveal">
              <motion.path
                d={routeD}
                fill="none"
                stroke="#fff"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.8, ease: "easeInOut", delay: 0.5 }}
              />
            </mask>
          </defs>
          <path
            d={routeD}
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="0.7"
            strokeDasharray="0.6 2.6"
            strokeLinecap="round"
            opacity="0.75"
            mask="url(#quiz-route-reveal)"
          />
        </>
      )}
      {charted.map((s, i) =>
        s.correct ? (
          <path
            key={i}
            d={starPath(s.pt.x, s.pt.y, s.pt.r * 1.6)}
            fill="var(--color-gold)"
            className="animate-twinkle"
            style={{
              animationDelay: `${((i * 5) % 8) * 0.4}s`,
              animationDuration: `${2.8 + ((i * 3) % 6) * 0.5}s`,
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
          />
        ) : (
          <circle
            key={i}
            cx={s.pt.x}
            cy={s.pt.y}
            r={s.pt.r * 0.85}
            fill="none"
            stroke="var(--color-starlight)"
            strokeWidth="0.45"
            opacity="0.4"
          />
        )
      )}
    </svg>
  );
};

// Short-answer grading: collapse case, accents, punctuation, and whitespace so
// "Paris." / " paris " / "café" all match their key. Still an exact compare
// after normalizing - true semantic grading would need the model.
const normalizeAnswer = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const QuizComponent = ({
  isOpen,
  onClose,
  classData,
}: Props) => {
  // Quiz configuration
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [numQuestions, setNumQuestions] = useState<number>(10);
  const [selectedFiles, setSelectedFiles] = useState<any[]>([]);

  // Quiz state
  const [quizState, setQuizState] = useState<string>("setup"); // setup, taking, reviewing, completed
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({});
  const [quizScore, setQuizScore] = useState<QuizScore | null>(null);
  const [generatingQuiz, setGeneratingQuiz] = useState<boolean>(false);

  // History - dropdown menu
  const [quizHistory, setQuizHistory] = useState<QuizHistoryItem[]>([]);

  // History dropdown toggle
  const [showHistoryDropdown, setShowHistoryDropdown] =
    useState<boolean>(false);

  // Error dialog state
  const [errorDialog, setErrorDialog] = useState<StudyErrorState>({
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

  // Aborts an in-flight generation when the user cancels or closes mid-generate.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight generation if the quiz is closed/unmounted mid-generate.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Lightweight console diagnostics during generation (no on-screen panel).
  const addDebugLog = (message: string, _type = "info") => {
    // Dev-only generation diagnostics; silent in production builds.
    if (import.meta.env.DEV) {
      console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
    }
  };

  useEffect(() => {
    if (isOpen && classData) {
      // Load quiz history for this class
      loadQuizHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, classData]);

  // Lock background scroll while the expedition overlay is open (shared,
  // reference-counted so nested dialogs above it don't release early).
  useScrollLock(isOpen);

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

  // File resolution (text + vision images) lives in
  // @features/study/resolveStudyFiles (shared with Flashcards) - imported above.

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

  // Escape steps back through phases / closes - same path as the back key,
  // and stacked so a dialog above the quiz pops first.
  useEscapeToClose(isOpen, handleBackButton);

  const handleGenerateQuiz = async () => {
    if (selectedFiles.length === 0) {
      setErrorDialog({
        isOpen: true,
        title: "No Files Selected",
        message: "Please select at least one file to generate a quiz from.",
      });
      return;
    }

    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;
    setGeneratingQuiz(true);

    try {
      addDebugLog(
        `🚀 Starting quiz generation with ${selectedFiles.length} files`
      );

      // Resolve the selected files into prompt text + vision images via the
      // shared resolver - same broad support as Chat with AI (PDF text +
      // figures, scanned PDFs, DOCX, PPTX, photos, HEIC, code/data, ...).
      const selected = selectedFiles
        .map((fileId: any) => classData.files.find((f: any) => f.id === fileId))
        .filter(Boolean);
      const { context: filesContext, imageFiles, usableCount } =
        await resolveStudyFiles(selected);

      // Cancelled while the files were being fetched / parsed.
      if (ac.signal.aborted) return;
      addDebugLog(
        `📊 Result: ${usableCount}/${selectedFiles.length} files usable`
      );

      if (usableCount === 0) {
        addDebugLog(`❌ FAILED: No content read from any file`, "error");
        setErrorDialog({
          isOpen: true,
          title: "Couldn't read those files",
          message:
            "We couldn't pull any usable text or images from the selected files. They may be empty, corrupted, or in a format we can't read. Try selecting different materials.",
        });
        setGeneratingQuiz(false);
        return;
      }

      addDebugLog(`✓ Built context: ${filesContext.length} chars`);
      addDebugLog(`🤖 Sending request to AI...`);

      // Determine point ranges based on difficulty (reduced to 1-5)
      const pointRanges = {
        easy: { min: 1, max: 2 },
        medium: { min: 2, max: 4 },
        hard: { min: 3, max: 5 },
      };

      const range = (
        pointRanges as Record<string, { min: number; max: number }>
      )[difficulty]!;

      const prompt = `You are an expert quiz generator. Create a comprehensive ${difficulty} difficulty quiz with exactly ${numQuestions} questions based on the provided study materials: the text below, plus any attached images (photos, slides, or scanned/figure pages) - read those too.

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
        ac.signal, // signal
        [], // history
        imageFiles, // files (vision images from the selected materials)
        { mode: "generate" }
      );

      // Cancelled (or the quiz closed) mid-generation: bail before parsing or
      // entering the quiz - the cancel handler already reset the UI.
      if (ac.signal.aborted || aiResult?.errorType === "aborted") return;

      // If the AI call itself failed (offline, busy, etc.), surface the
      // friendly message rather than mislabeling it as a content/JSON error.
      if (aiResult?.error) {
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
      parsedQuiz.questions = parsedQuiz.questions.map((q: any, idx: number) => {
        const type = q.type || "multiple-choice";
        const options =
          q.options && q.options.length
            ? q.options
            : type === "true-false"
              ? ["True", "False"]
              : [];
        let correctAnswer = q.correctAnswer ?? 0;
        // The model is asked to return the option INDEX for choice questions, but
        // it sometimes returns the option text (e.g. "True"). Grading compares
        // indices, so map any text answer back to its index to stay correct.
        if (
          (type === "multiple-choice" || type === "true-false") &&
          typeof correctAnswer === "string" &&
          !/^\d+$/.test(correctAnswer.trim())
        ) {
          const matchIdx = options.findIndex(
            (o: any) => normalizeAnswer(o) === normalizeAnswer(correctAnswer)
          );
          if (matchIdx >= 0) correctAnswer = matchIdx;
        }
        return {
          id: q.id || idx + 1,
          type,
          question: q.question || "Question text missing",
          options,
          correctAnswer,
          explanation: q.explanation || "No explanation provided",
          points: q.points || range.min, // Default to minimum points for the difficulty level
        };
      });

      setCurrentQuiz({
        ...parsedQuiz,
        difficulty,
        // Persist the ACTUAL number of questions the model returned (it may
        // differ from the requested count), so history/progress stay accurate.
        numQuestions: parsedQuiz.questions.length,
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
      // Cancelled mid-generate (the AI fetch aborted) - not a real failure.
      if (ac.signal.aborted) return;
      console.error("Error generating quiz:", error);
      setErrorDialog({
        isOpen: true,
        title: "Quiz Generation Failed",
        message:
          "Couldn't generate the quiz from these materials right now. Please try again in a moment.",
      });
    } finally {
      if (abortControllerRef.current === ac) abortControllerRef.current = null;
      setGeneratingQuiz(false);
    }
  };

  const handleCancelGeneration = () => {
    abortControllerRef.current?.abort();
    setGeneratingQuiz(false);
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
        // Normalize both sides (case, accents, punctuation, whitespace) so
        // trivial formatting differences don't mark a right answer wrong.
        const userAns = normalizeAnswer(userAnswer);
        const correctAns = normalizeAnswer(question.correctAnswer);
        isCorrect = userAns.length > 0 && userAns === correctAns;
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
      percentage:
        totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0,
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

        const { error: saveError } = await supabase
          .from("quiz_history")
          .insert({
            user_id: user.id,
            class_id: classData.id,
            quiz_data: quizDataWithFiles,
            user_answers: userAnswers,
            score: scoreData,
            created_at: new Date().toISOString(),
          });

        // Best-effort save (the results still show either way); surface a real
        // failure instead of swallowing it, and only refresh on success.
        if (saveError) {
          console.warn("Could not save quiz to history:", saveError);
        } else {
          loadQuizHistory();
        }
      }
    } catch (error) {
      console.error("Error saving quiz history:", error);
    }
  };

  const handleRetakeWithSameSettings = async () => {
    // The attempt is already in history: handleSubmitQuiz saved it on submit,
    // and a quiz loaded from history is stored already. Re-saving here would
    // duplicate the row, so just reset and regenerate with the same settings.
    setQuizState("setup");
    setCurrentQuiz(null);
    setUserAnswers({});
    setQuizScore(null);
    setGeneratingQuiz(true);
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

  // Purely presentational: while a quiz is being taken the screen becomes the
  // night chart (focus moment); setup/generating/reviewing stay on parchment.
  const isNight = quizState === "taking" && !!currentQuiz && !generatingQuiz;

  // Count only non-empty answers - a cleared short-answer leaves a "" entry that
  // shouldn't count as answered. Drives progress and the Submit gate.
  const answeredCount = Object.values(userAnswers).filter(
    (v) => v != null && String(v).trim() !== ""
  ).length;
  const allAnswered =
    !!currentQuiz && answeredCount === currentQuiz.questions.length;

  // Portal to <body>: the overlay is position:fixed, but on a deep-link refresh
  // the Dashboard/ClassDetails wrappers are mid entrance-animation, and an
  // ancestor transform makes itself the containing block for fixed descendants -
  // which would constrain/shift this overlay until that transform clears. Out of
  // the tree, it stays viewport-anchored and full-screen on refresh and click.
  return createPortal(
    <motion.div
      className={`fixed inset-0 z-[var(--z-overlay)] flex flex-col overflow-hidden transition-colors duration-700 ${
        isNight ? "bg-night" : "atlas-sky"
      }`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <PageBackdrop seed="quiz expedition" />
      {/* The night's faint stars behind the expedition. */}
      {isNight && <Starfield count={30} seed={9} />}
      {/* Header - atlas plate masthead */}
      <div
        className={`py-5 px-14 flex items-center gap-5 relative z-100 max-[1024px]:px-9 max-md:px-5 max-md:sticky max-md:top-0 max-[480px]:px-3.75 ${
          isNight
            ? "max-md:bg-night/95"
            : "atlas-sky"
        }`}
      >
        <BackButton
          night={isNight}
          onClick={handleBackButton}
          label={
            quizState === "taking" || quizState === "reviewing"
              ? "Back to setup"
              : "Close quiz"
          }
          className="shrink-0"
        />
        <div className="flex-1 flex items-center">
          <div>
            <h1
              className={`m-0 font-display text-[24px] font-semibold tracking-[-0.01em] max-md:text-[16px] ${
                isNight ? "text-starlight" : "text-ink"
              }`}
            >
              Quiz
            </h1>
            <p
              className={`mt-1 mx-0 mb-0 font-mono text-[10px] font-medium uppercase tracking-[0.2em] max-md:text-[9px] ${
                isNight ? "text-starlight/50" : "text-muted"
              }`}
            >
              {classData?.name}
            </p>
          </div>
        </div>

        {/* History - shared dropdown; rows are feature-owned via renderItem. */}
        <HistoryDropdown
          open={showHistoryDropdown}
          onToggle={() => setShowHistoryDropdown((v) => !v)}
          onClose={() => setShowHistoryDropdown(false)}
          night={isNight}
          title="Quiz History"
          items={quizHistory}
          itemKey={(item) => item.id}
          nounSingular="quiz"
          nounPlural="quizzes"
          itemClassName={HISTORY_ROW}
          onItemClick={(item) => {
            loadQuizFromHistory(item);
            setShowHistoryDropdown(false);
          }}
          emptySeed="quiz history"
          emptyTitle="No History Yet"
          emptyHint="Your quiz attempts will appear here"
          renderItem={(item) => {
            // Handle both old and new quiz data structures.
            const numQuestions =
              item.quiz_data?.numQuestions ||
              item.quiz_data?.questions?.length ||
              0;
            const difficulty = item.quiz_data?.difficulty || "medium";
            const itemFiles = item.quiz_data?.selectedFiles || [];
            return (
              <>
                {/* Score ring - drawn in by the global `progress` keyframes */}
                <div className="relative w-12 h-12 shrink-0">
                  <svg
                    viewBox="0 0 36 36"
                    className="block max-w-full max-h-full"
                  >
                    <path
                      className="fill-none stroke-[rgb(29_27_22/0.12)] stroke-3"
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="fill-none stroke-gold stroke-3 [stroke-linecap:round] animate-[progress_1s_ease-out_forwards]"
                      strokeDasharray={`${item.score.percentage}, 100`}
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] font-medium text-ink">
                    {item.score.percentage}%
                  </div>
                </div>

                {/* Ledger entry - date over mono meta */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="font-display text-[15px] font-semibold leading-tight text-ink">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                  <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-muted">
                    {item.score.correctCount}/{numQuestions} correct ·{" "}
                    {difficulty}
                  </span>
                  {itemFiles.length > 0 && (
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-[1.4] text-muted/80">
                      {itemFiles
                        .map((fileId: any) => {
                          const file = classData?.files?.find(
                            (f: any) => f.id === fileId
                          );
                          return file?.name || "Unknown";
                        })
                        .slice(0, 2)
                        .join(", ")}
                      {itemFiles.length > 2 && ` +${itemFiles.length - 2}`}
                    </span>
                  )}
                </div>

                {/* Delete key - surfaces on hover (always shown on touch) */}
                <IconButton
                  size="action"
                  variant="danger"
                  label="Delete quiz"
                  className="opacity-0 group-hover:opacity-100 max-md:opacity-100"
                  onClick={(e) => handleDeleteClick(e, item.id)}
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
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </IconButton>
              </>
            );
          }}
        />
      </div>

      {/* quiz-content-area class kept as a querySelector hook (scroll-to-top);
          `relative` keeps it painting above the night Starfield. */}
      <div className="quiz-content-area relative flex-1 min-h-0 overflow-y-auto [-webkit-overflow-scrolling:touch] p-5 bg-transparent flex flex-col max-md:block max-md:p-0">
        <AnimatePresence mode="wait">
          {/* Setup State */}
          {quizState === "setup" && !generatingQuiz && (
            <motion.div
              key="setup"
              className="w-full max-w-350 m-auto flex flex-col gap-5 p-0 h-auto justify-center max-[1024px]:max-w-175 max-[1024px]:p-3.75 max-md:max-w-full max-md:py-3 max-md:px-5 max-[480px]:px-3.75"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              {/* Configuration Cards Grid */}
              <motion.div
                className="grid grid-cols-3 grid-rows-[1fr_1fr] gap-3.75 items-stretch mb-5 flex-1 max-[1024px]:grid-cols-2 max-[1024px]:grid-rows-[auto] max-[1024px]:gap-4 max-md:flex max-md:flex-col max-md:gap-3"
                variants={stagger()}
                initial="hidden"
                animate="visible"
              >
                {/* Header Section - the expedition's title plate */}
                <div
                  className={`${UI.plate} shrink-0 text-center py-7.5 px-5 overflow-hidden col-[1/3] row-1 flex flex-col items-center justify-center max-md:py-5 max-md:px-4 max-md:rounded-[10px]`}
                >
                  <CornerTicks />
                  <motion.div
                    className="mb-3 text-verdi max-md:mb-2"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 15,
                      delay: 0.2,
                    }}
                  >
                    <Constellation
                      name={classData?.name || "quiz"}
                      size={64}
                      className="max-md:h-11 max-md:w-11"
                    />
                  </motion.div>
                  <p className={`mt-0 mx-0 mb-2 ${UI.overline}`}>
                    Plan your expedition
                  </p>
                  <h2 className="mt-0 mx-0 mb-2 font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.01em] text-ink max-md:text-[22px]">
                    Create Your Quiz
                  </h2>
                  <p className="m-0 text-[15px] text-muted max-md:text-[12px]">
                    Customize difficulty, length, and source materials
                  </p>
                </div>

                {/* Difficulty Card */}
                <motion.div
                  className={`${CONFIG_CARD} col-1 row-2`}
                  variants={fadeRise}
                >
                  <div className={CONFIG_CARD_HEADER}>
                    <h3 className={CONFIG_H3}>Difficulty</h3>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {[
                      { level: "easy", label: "Easy", desc: "1-2 pts" },
                      { level: "medium", label: "Medium", desc: "2-4 pts" },
                      { level: "hard", label: "Hard", desc: "3-5 pts" },
                    ].map(({ level, label, desc }) => (
                      <motion.button
                        key={level}
                        className={difficultyBtn(difficulty === level)}
                        onClick={() => setDifficulty(level)}
                        disabled={generatingQuiz}
                        {...pressLift}
                      >
                        <span
                          aria-hidden="true"
                          className={`shrink-0 text-[11px] leading-none ${
                            difficulty === level ? "text-gold" : "opacity-0"
                          }`}
                        >
                          ✦
                        </span>
                        <span className="flex-1 text-[14px] font-semibold text-left">
                          {label}
                        </span>
                        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] opacity-60">
                          {desc}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {/* Number of Questions Card */}
                <motion.div
                  className={`${CONFIG_CARD} col-2 row-2`}
                  variants={fadeRise}
                >
                  <div className={CONFIG_CARD_HEADER}>
                    <h3 className={CONFIG_H3}>Questions</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 max-md:gap-2 max-[480px]:grid-cols-2">
                    {[5, 10, 20, 30, 40, 50].map((num) => (
                      <motion.button
                        key={num}
                        className={numberBtn(numQuestions === num)}
                        onClick={() => setNumQuestions(num)}
                        disabled={generatingQuiz}
                        {...pressLift}
                      >
                        <span className="font-display text-[20px] font-semibold leading-tight max-md:text-[18px]">
                          {num}
                        </span>
                        <span className="font-mono text-[8.5px] font-medium uppercase tracking-[0.14em] opacity-60">
                          questions
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {/* Files Selection Card - shared with Flashcards. */}
                <FileSelectionCard
                  className="col-3 row-[1/3] max-[1024px]:col-[1/3] max-[1024px]:row-3"
                  files={
                    (classData?.files?.filter((f: any) =>
                      isSupportedForAI(f.name)
                    ) || []) as any
                  }
                  selectedIds={selectedFiles}
                  onSelectionChange={setSelectedFiles}
                  disabled={generatingQuiz}
                  emptyTitle="No usable files"
                  emptyHint="Upload notes, PDFs, slides, images, or docs to create quizzes"
                />
              </motion.div>

              {/* Generate Button - the one gold CTA on this screen */}
              <Button
                variant="gold"
                className="mx-auto w-fit px-9 max-md:mb-6"
                onClick={handleGenerateQuiz}
                disabled={selectedFiles.length === 0 || generatingQuiz}
              >
                <span aria-hidden="true" className="text-[13px]">
                  ✦
                </span>
                <span>Begin expedition</span>
              </Button>
            </motion.div>
          )}

          {/* Generating State - shared with Flashcards. */}
          {generatingQuiz && (
            <GeneratingState
              key="generating"
              label="Charting questions…"
              description={`Creating ${numQuestions} ${difficulty} questions from your selected files`}
              onCancel={handleCancelGeneration}
            />
          )}

          {/* Taking Quiz State */}
          {quizState === "taking" && currentQuiz && (
            <motion.div
              key="taking"
              className="mx-0 my-auto w-full max-w-full h-full p-0 flex flex-col overflow-hidden max-md:h-auto max-md:my-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="grid grid-cols-[1fr_400px] gap-5 h-full w-full max-w-full m-0 py-5 px-7.5 items-start overflow-hidden box-border max-[1024px]:grid-cols-[1fr_320px] max-[1024px]:p-5 max-[1024px]:gap-3.75 max-md:flex max-md:flex-col max-md:h-auto max-md:p-0 max-md:gap-0">
                {/* Left Side - Scrollable Questions */}
                <div className="flex flex-col gap-5 pb-10 overflow-y-auto h-[calc(100dvh-132px)] pr-2.5 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-md:w-full max-md:h-auto max-md:p-3 max-md:pb-20 max-md:overflow-y-visible max-md:gap-3">
                  {currentQuiz.questions.map((question, index) => (
                    <div key={question.id} className={QUESTION_CARD}>
                      {/* Mono gold overline: QUESTION 04 · 2 PTS */}
                      <div className="flex items-center gap-2 mb-3.75 max-md:mb-3">
                        <span className={UI.overlineNight}>
                          Question {String(index + 1).padStart(2, "0")}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-[11px] leading-none text-starlight/30"
                        >
                          ·
                        </span>
                        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-starlight/45">
                          {question.points} pts
                        </span>
                      </div>
                      <h3 className="mt-0 mx-0 mb-5 text-[18px] font-medium leading-[1.6] text-starlight max-md:text-[14px] max-md:mb-3">
                        {question.question}
                      </h3>

                      {question.type === "multiple-choice" && (
                        <div className="flex flex-col gap-3 max-md:gap-2">
                          {(question.options as any[]).map(
                            (option: any, optIndex: number) => (
                              <label
                                key={optIndex}
                                className={quizOption(
                                  userAnswers[question.id] === String(optIndex)
                                )}
                              >
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

                      {question.type === "true-false" && (
                        <div className="flex flex-col gap-3 max-md:gap-2">
                          {(question.options || ["True", "False"]).map(
                            (option, optIndex) => (
                              <label
                                key={optIndex}
                                className={quizOption(
                                  userAnswers[question.id] === String(optIndex)
                                )}
                              >
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
                          className={QUIZ_TEXTAREA}
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

                {/* Right Side - Sticky Sidebar (the expedition log) */}
                <div
                  className={`${SIDEBAR} bg-night-2 p-5 gap-4.5 max-[1024px]:p-4 max-[1024px]:gap-3.5 max-md:hidden`}
                >
                  {/* Header */}
                  <div className="text-center pb-3.75 border-0 border-b border-solid border-line-night">
                    <h3 className={`mt-0 mx-0 mb-1.5 ${UI.overlineNight}`}>
                      Quiz Overview
                    </h3>
                    <p className="text-[12px] text-starlight/55 m-0">
                      Track your progress and submit when ready
                    </p>
                  </div>

                  {/* Progress Section */}
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col items-center gap-2">
                      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-starlight/50">
                        Progress
                      </span>
                      <span className="font-display text-[40px] font-semibold text-starlight leading-none">
                        {answeredCount}/{currentQuiz.questions.length}
                      </span>
                      <span className="text-[12px] text-starlight/55">
                        Questions Answered
                      </span>
                    </div>
                    {/* Thin gold route with a star at its tip */}
                    <div className="relative w-full h-1 rounded-full bg-starlight/15">
                      <div
                        className="relative h-full bg-gold [transition:width_0.3s_ease] rounded-full after:absolute after:-right-1.25 after:top-1/2 after:-translate-y-1/2 after:text-[10px] after:leading-none after:text-gold after:content-['✦']"
                        style={{
                          width: `${
                            (answeredCount / currentQuiz.questions.length) * 100
                          }%`,
                        }}
                      />
                    </div>
                    <div className="text-center font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-gold mt-1.5">
                      {Math.round(
                        (answeredCount / currentQuiz.questions.length) * 100
                      )}
                      % Complete
                    </div>
                  </div>

                  {/* Stats Grid - instrument readouts */}
                  <div className="grid grid-cols-2 gap-2.5 py-3.75 border-0 border-y border-solid border-line-night">
                    <div className={STAT_ITEM}>
                      <span className={STAT_LABEL}>Total Questions</span>
                      <span className={STAT_VALUE}>
                        {currentQuiz.questions.length}
                      </span>
                    </div>
                    <div className={STAT_ITEM}>
                      <span className={STAT_LABEL}>Remaining</span>
                      <span className={STAT_VALUE}>
                        {currentQuiz.questions.length - answeredCount}
                      </span>
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
                  <div className="flex flex-col gap-2.5 pt-1.25">
                    <motion.button
                      whileHover={{
                        scale: allAnswered ? 1.02 : 1,
                        y: allAnswered ? -2 : 0,
                      }}
                      whileTap={{ scale: allAnswered ? 0.98 : 1 }}
                      className={`${UI.btnGold} w-full text-[14px]`}
                      onClick={handleSubmitQuiz}
                      disabled={!allAnswered}
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
                      className={`${NIGHT_QUIT_BTN} w-full px-5 py-3 text-[14px] font-semibold`}
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
                {/* Mobile-only action bar: the desktop sidebar that holds
                    Submit/Quit is display:none ≤768px, so surface them here in a
                    fixed bottom bar (otherwise a quiz can't be submitted on a phone). */}
                <div className="hidden max-md:flex fixed bottom-0 left-0 right-0 z-100 gap-2 p-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-night-2/95 backdrop-blur-[2px] border-0 border-t border-solid border-line-night">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    className={`${NIGHT_QUIT_BTN} flex-1 py-3 px-4 text-[15px] font-semibold`}
                    onClick={handleQuit}
                  >
                    Quit
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    className={`${UI.btnGold} flex-1 px-4 py-3 text-[15px]`}
                    onClick={handleSubmitQuiz}
                    disabled={!allAnswered}
                  >
                    Submit Quiz
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Reviewing/Results State */}
          {quizState === "reviewing" && quizScore && currentQuiz && (
            <motion.div
              key="reviewing"
              className="mx-0 my-auto w-full max-w-full h-full p-0 flex flex-col overflow-hidden max-md:h-auto max-md:my-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="grid grid-cols-[1fr_400px] gap-5 h-full w-full max-w-full m-0 py-5 px-7.5 items-start overflow-hidden box-border max-[1024px]:grid-cols-[1fr_320px] max-[1024px]:p-5 max-[1024px]:gap-3.75 max-md:flex max-md:flex-col max-md:h-auto max-md:p-3 max-md:gap-3">
                {/* Left Side - Scrollable Review */}
                <div className="flex flex-col gap-5 pb-15 overflow-y-auto h-[calc(100dvh-132px)] pr-2.5 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-md:w-full max-md:h-auto max-md:p-0 max-md:gap-2.5 max-md:overflow-y-visible max-[480px]:p-3">
                  {currentQuiz?.questions?.map((question, index) => {
                    const result = quizScore.results[question.id]!;
                    return (
                      <div
                        key={question.id}
                        className={reviewCard(result.isCorrect)}
                      >
                        <div className="flex justify-between items-center mb-3.75 flex-wrap gap-2.5">
                          <span className={QUESTION_NUMBER}>
                            Question {index + 1}
                          </span>
                          <span className={reviewBadge(result.isCorrect)}>
                            {result.isCorrect ? "✓ Correct" : "✗ Incorrect"}
                          </span>
                          <span className={QUESTION_POINTS}>
                            {result.isCorrect ? question.points : 0}/
                            {question.points} points
                          </span>
                        </div>
                        <h4 className="mt-0 mx-0 mb-3.75 text-[18px] font-medium leading-[1.6] text-ink">
                          {question.question}
                        </h4>

                        {(question.type === "multiple-choice" ||
                          question.type === "true-false") &&
                          question.options && (
                            <div
                              className={`my-3.75 ${REVIEW_WASH} [&_p]:my-2 [&_p]:mx-0 [&_p]:text-[14px] [&_p]:text-ink`}
                            >
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
                                  <strong className="font-semibold text-verdi">
                                    Correct answer:
                                  </strong>{" "}
                                  {question.options[result.correctAnswer]}
                                </p>
                              )}
                            </div>
                          )}

                        {question.type === "short-answer" && (
                          <div
                            className={`my-3.75 ${REVIEW_WASH} [&_p]:my-2 [&_p]:mx-0 [&_p]:text-[14px] [&_p]:text-ink`}
                          >
                            <p>
                              <strong className="font-semibold text-ink">
                                Your answer:
                              </strong>{" "}
                              {result.userAnswer || "Not answered"}
                            </p>
                            {!result.isCorrect && (
                              <p>
                                <strong className="font-semibold text-verdi">
                                  Correct answer:
                                </strong>{" "}
                                {result.correctAnswer}
                              </p>
                            )}
                          </div>
                        )}

                        <div
                          className={`mt-3.75 ${REVIEW_WASH} text-[14px] text-ink leading-[1.6]`}
                        >
                          <strong className="font-semibold text-gold-deep">
                            Explanation:
                          </strong>{" "}
                          {result.explanation}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right Side - Sticky Results Panel: "your constellation" */}
                <div
                  className={`${SIDEBAR} bg-night p-0 max-md:static max-md:w-full max-md:order-first max-md:rounded-[10px] max-[480px]:top-13.75`}
                >
                  {/* Hero - the expedition charted as a sky of stars */}
                  <div className="relative overflow-hidden px-5 pt-7 pb-5 text-center max-[1024px]:px-4 max-[1024px]:pt-6 max-md:px-4 max-md:pt-6 max-md:pb-4">
                    <Starfield count={34} seed={5} />
                    <CornerTicks className="text-starlight/25" />
                    <div className="relative flex flex-col items-center gap-1.5">
                      <p className={`m-0 ${UI.overlineNight}`}>
                        Expedition complete
                      </p>
                      <div className="font-display text-[68px] font-semibold leading-none tracking-[-0.02em] text-starlight max-[1024px]:text-[54px] max-md:text-[48px]">
                        {quizScore.percentage}
                        <span className="ml-0.5 align-baseline text-[28px] font-medium text-starlight/60 max-md:text-[22px]">
                          %
                        </span>
                      </div>
                      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-starlight/55">
                        {quizScore.earnedPoints} / {quizScore.totalPoints}{" "}
                        points
                      </div>
                      <div className="mt-2 w-full">
                        <ResultsConstellation
                          questions={currentQuiz.questions}
                          results={quizScore.results}
                        />
                      </div>
                      <div className="flex items-center justify-center gap-4 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-starlight/55">
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="text-[11px] leading-none text-gold"
                          >
                            ✦
                          </span>
                          Correct
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="inline-block h-2 w-2 rounded-full border border-solid border-starlight/50"
                          ></span>
                          Incorrect
                        </span>
                      </div>
                      <p className="m-0 mt-1 text-[11px] text-starlight/50">
                        Review your performance
                      </p>
                    </div>
                  </div>

                  {/* Results Stats - instrument readouts */}
                  <div className="grid grid-cols-2 gap-2 px-5 py-4 border-0 border-t border-solid border-line-night max-[1024px]:px-4 max-md:px-4 max-md:py-3">
                    <div className={STAT_ITEM}>
                      <span className={STAT_LABEL}>Correct</span>
                      <span className={STAT_VALUE}>
                        {quizScore.correctCount || 0}
                      </span>
                    </div>
                    <div className={STAT_ITEM}>
                      <span className={STAT_LABEL}>Incorrect</span>
                      <span className={STAT_VALUE}>
                        {currentQuiz.questions.length -
                          (quizScore.correctCount || 0)}
                      </span>
                    </div>
                  </div>

                  {/* Quiz Info */}
                  <div className="flex flex-col gap-1 px-5 py-4 border-0 border-t border-solid border-line-night max-[1024px]:px-4 max-md:px-4 max-md:py-3">
                    <div className={INFO_ROW}>
                      <span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
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
                    <div className={INFO_ROW}>
                      <span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
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
                      <div className={INFO_ROW_STACK}>
                        <span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
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
                        <span className="text-[11px] text-starlight/70 leading-[1.4] font-medium">
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
                  <div className="flex flex-col gap-2 px-5 pb-5 pt-4 border-0 border-t border-solid border-line-night max-[1024px]:px-4 max-md:flex-row max-md:px-4 max-md:pb-4">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`${UI.btnGold} w-full px-4.5 py-3 text-[13px] max-md:flex-1`}
                      onClick={handleDone}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
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
                      className={`${NIGHT_GHOST_BTN} w-full px-4.5 py-3 text-[13px] font-semibold max-md:flex-1`}
                      onClick={handleRetakeWithSameSettings}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
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

      {/* Error Dialog - shared study error sheet ("Got it"). */}
      <StudyErrorDialog
        error={errorDialog}
        onClose={() =>
          setErrorDialog({ isOpen: false, title: "", message: "" })
        }
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
    </motion.div>,
    document.body
  );
};

export default QuizComponent;
