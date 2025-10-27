import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchStreamingResponse } from "../services/openaiService";
import { getFilePublicUrl } from "../utils/storageUtils";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import "./QuizComponentMobile.css";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const QuizComponentMobile = ({ classId, onBack }) => {
  const [quizState, setQuizState] = useState("setup");
  const [difficulty, setDifficulty] = useState("medium");
  const [numQuestions, setNumQuestions] = useState(5);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [availableFiles, setAvailableFiles] = useState([]);
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, [classId]);

  const fetchFiles = async () => {
    try {
      const { data: files, error } = await supabase
        .from("files")
        .select("*")
        .eq("class_id", classId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAvailableFiles(files || []);
      setSelectedFiles(files?.map((f) => f.id) || []);
    } catch (err) {
      console.error("Error fetching files:", err);
      setError("Failed to load files");
    }
  };

  const toggleFileSelection = (fileId) => {
    setSelectedFiles((prev) =>
      prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId]
    );
  };

  const extractPdfContent = async (file) => {
    try {
      const { url, error } = await getFilePublicUrl(
        "files",
        file.path || file.file_path
      );
      if (!url || error) {
        console.error(`Could not get URL for ${file.name}:`, error);
        return null;
      }

      const response = await fetch(url);
      if (!response.ok) {
        console.error(`PDF fetch failed: HTTP ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();

      // Validate arrayBuffer has data
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        console.error(`PDF file is empty: ${file.name}`);
        return null;
      }

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      let text = "";
      const maxPages = Math.min(pdf.numPages, 30);

      for (let i = 1; i <= maxPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item) => item.str).join(" ");
          text += pageText + "\n\n";

          if (text.length > 50000) break;
        } catch (pageError) {
          console.warn(`Error extracting page ${i}:`, pageError);
          break;
        }
      }

      const extractedText = text.slice(0, 50000).trim();
      return extractedText.length > 0 ? extractedText : null;
    } catch (error) {
      console.error(`PDF extraction error (${file.name}):`, error);
      return null;
    }
  };

  const extractTextContent = async (file) => {
    try {
      const { url, error } = await getFilePublicUrl(
        "files",
        file.path || file.file_path
      );
      if (!url || error) {
        console.error(`Could not get URL for ${file.name}:`, error);
        return null;
      }

      const response = await fetch(url);

      if (!response.ok) {
        console.error(`Text file fetch failed: HTTP ${response.status}`);
        return null;
      }

      const text = await response.text();
      return text.slice(0, 50000).trim(); // Limit text length
    } catch (error) {
      console.error("Text extraction error:", error);
      return null;
    }
  };

  const extractFileContent = async (file) => {
    const extension = file.name.split(".").pop().toLowerCase();

    if (extension === "pdf") {
      return await extractPdfContent(file);
    } else if (["txt", "md"].includes(extension)) {
      return await extractTextContent(file);
    }

    return null;
  };

  const generateQuiz = async () => {
    if (selectedFiles.length === 0) {
      setError("Please select at least one file");
      return;
    }

    setLoading(true);
    setQuizState("generating");
    setError(null);

    try {
      const fileContents = await Promise.all(
        selectedFiles.map(async (fileId) => {
          const file = availableFiles.find((f) => f.id === fileId);
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
        const failedFiles = selectedFiles
          .map((id) => availableFiles.find((f) => f.id === id)?.name)
          .filter(Boolean)
          .join(", ");

        throw new Error(
          `Unable to extract text from the selected files (${failedFiles}). This could be due to: corrupted PDFs, scanned images without text, or unsupported formats. Please try different files or upload text-based documents.`
        );
      }

      // Warn if some files failed
      if (validContents.length < selectedFiles.length) {
        const failedCount = selectedFiles.length - validContents.length;
        console.warn(
          `${failedCount} file(s) could not be processed. Continuing with ${validContents.length} file(s).`
        );
      }

      const filesContext = validContents
        .map((f) => `=== ${f.name} ===\n${f.content}`)
        .join("\n\n");

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

      await fetchStreamingResponse(
        prompt,
        "",
        (chunk) => {
          quizData += chunk;
        },
        null,
        [],
        []
      );

      let cleanedData = quizData.trim();
      cleanedData = cleanedData.replace(/^```json\s*/i, "");
      cleanedData = cleanedData.replace(/^```\s*/i, "");
      cleanedData = cleanedData.replace(/\s*```$/i, "");
      cleanedData = cleanedData.trim();

      const jsonStart = cleanedData.indexOf("{");
      const jsonEnd = cleanedData.lastIndexOf("}");

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("No valid JSON found in response");
      }

      cleanedData = cleanedData.substring(jsonStart, jsonEnd + 1);

      let parsedQuiz;
      try {
        parsedQuiz = JSON.parse(cleanedData);
      } catch (parseError) {
        let fixedData = cleanedData;
        fixedData = fixedData.replace(/[""]/g, '\\"');
        fixedData = fixedData.replace(/['']/g, "'");
        fixedData = fixedData.replace(/,(\s*[}\]])/g, "$1");

        try {
          parsedQuiz = JSON.parse(fixedData);
        } catch (secondError) {
          throw new Error("Failed to parse quiz data. Please try again.");
        }
      }

      if (!parsedQuiz.questions || !Array.isArray(parsedQuiz.questions)) {
        throw new Error("Invalid quiz structure");
      }

      if (parsedQuiz.questions.length === 0) {
        throw new Error("No questions generated");
      }

      parsedQuiz.questions = parsedQuiz.questions.map((q, idx) => ({
        id: q.id || idx + 1,
        type: q.type || "multiple-choice",
        question: q.question || "Question text missing",
        options: q.options || [],
        correctAnswer: q.correctAnswer ?? 0,
        explanation: q.explanation || "No explanation provided",
        points: q.points || range.min,
      }));

      setCurrentQuiz(parsedQuiz);
      setQuizState("taking");
      setUserAnswers({});
    } catch (err) {
      console.error("Quiz generation error:", err);
      setError(err.message || "Failed to generate quiz");
      setQuizState("setup");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId, answer) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  const submitQuiz = () => {
    let correctCount = 0;
    let earnedPoints = 0;
    let totalPoints = 0;

    currentQuiz.questions.forEach((q) => {
      totalPoints += q.points;
      const userAnswer = userAnswers[q.id];

      if (q.type === "short-answer") {
        const correct =
          userAnswer?.toLowerCase().trim() ===
          q.correctAnswer?.toLowerCase().trim();
        if (correct) {
          correctCount++;
          earnedPoints += q.points;
        }
      } else {
        const correct = userAnswer === q.correctAnswer;
        if (correct) {
          correctCount++;
          earnedPoints += q.points;
        }
      }
    });

    setQuizScore({
      correctCount,
      totalQuestions: currentQuiz.questions.length,
      earnedPoints,
      totalPoints,
      percentage: Math.round((earnedPoints / totalPoints) * 100),
    });

    setQuizState("results");
  };

  const retakeQuiz = () => {
    setUserAnswers({});
    setQuizScore(null);
    setQuizState("taking");
  };

  const startNewQuiz = () => {
    setCurrentQuiz(null);
    setUserAnswers({});
    setQuizScore(null);
    setQuizState("setup");
  };

  const answeredCount = Object.keys(userAnswers).length;
  const totalQuestions = currentQuiz?.questions?.length || 0;

  return (
    <div className="quiz-mobile">
      {quizState === "setup" && (
        <>
          <div className="quiz-mobile-header">
            <button className="quiz-mobile-back" onClick={onBack}>
              ←
            </button>
          </div>

          <div className="quiz-mobile-content">
            <h2 className="quiz-mobile-title">Create Quiz</h2>

            <div className="quiz-mobile-section">
              <label className="quiz-mobile-label">Difficulty Level</label>
              <div className="quiz-mobile-pills">
                {["easy", "medium", "hard"].map((level) => (
                  <button
                    key={level}
                    className={`quiz-mobile-pill ${
                      difficulty === level ? "active" : ""
                    }`}
                    onClick={() => setDifficulty(level)}
                  >
                    {level === "easy" && "😊 Easy"}
                    {level === "medium" && "🤔 Medium"}
                    {level === "hard" && "🔥 Hard"}
                  </button>
                ))}
              </div>
            </div>

            <div className="quiz-mobile-section">
              <label className="quiz-mobile-label">Number of Questions</label>
              <div className="quiz-mobile-numbers">
                {[5, 10, 15, 20].map((num) => (
                  <button
                    key={num}
                    className={`quiz-mobile-number ${
                      numQuestions === num ? "active" : ""
                    }`}
                    onClick={() => setNumQuestions(num)}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="quiz-mobile-section">
              <label className="quiz-mobile-label">
                Select Files ({selectedFiles.length})
              </label>
              {availableFiles.length === 0 ? (
                <p className="quiz-mobile-empty">
                  No files available. Upload files to this class first.
                </p>
              ) : (
                <div className="quiz-mobile-files">
                  {availableFiles.map((file) => (
                    <div
                      key={file.id}
                      className={`quiz-mobile-file ${
                        selectedFiles.includes(file.id) ? "selected" : ""
                      }`}
                      onClick={() => toggleFileSelection(file.id)}
                    >
                      <div className="quiz-mobile-file-name">{file.name}</div>
                      {selectedFiles.includes(file.id) && (
                        <span className="quiz-mobile-check">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="quiz-mobile-error">{error}</div>}

            <button
              className="quiz-mobile-generate"
              onClick={generateQuiz}
              disabled={loading || selectedFiles.length === 0}
            >
              {loading ? "Generating..." : "Generate Quiz"}
            </button>
          </div>
        </>
      )}

      {quizState === "generating" && (
        <div className="quiz-mobile-generating">
          <div className="quiz-mobile-spinner"></div>
          <p>Generating your quiz...</p>
        </div>
      )}

      {quizState === "taking" && currentQuiz && (
        <>
          <div className="quiz-mobile-header">
            <button className="quiz-mobile-back" onClick={startNewQuiz}>
              ←
            </button>
          </div>

          <div className="quiz-mobile-progress">
            <div className="quiz-mobile-progress-text">
              Question {answeredCount} of {totalQuestions}
            </div>
            <div className="quiz-mobile-progress-bar">
              <div
                className="quiz-mobile-progress-fill"
                style={{
                  width: `${(answeredCount / totalQuestions) * 100}%`,
                }}
              ></div>
            </div>
          </div>

          <div className="quiz-mobile-content">
            <div className="quiz-mobile-questions">
              {currentQuiz.questions.map((question, index) => (
                <div key={question.id} className="quiz-mobile-question">
                  <div className="quiz-mobile-question-header">
                    <span className="quiz-mobile-question-num">
                      Q{index + 1}
                    </span>
                    <span className="quiz-mobile-points">
                      {question.points} pts
                    </span>
                  </div>
                  <div className="quiz-mobile-question-text">
                    {question.question}
                  </div>

                  {question.type === "short-answer" ? (
                    <textarea
                      className="quiz-mobile-textarea"
                      value={userAnswers[question.id] || ""}
                      onChange={(e) =>
                        handleAnswerChange(question.id, e.target.value)
                      }
                      placeholder="Type your answer..."
                    />
                  ) : (
                    <div className="quiz-mobile-options">
                      {question.options.map((option, optIndex) => (
                        <label
                          key={optIndex}
                          className={`quiz-mobile-option ${
                            userAnswers[question.id] === optIndex
                              ? "selected"
                              : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question-${question.id}`}
                            checked={userAnswers[question.id] === optIndex}
                            onChange={() =>
                              handleAnswerChange(question.id, optIndex)
                            }
                          />
                          <span className="quiz-mobile-option-text">
                            {option}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="quiz-mobile-submit-bar">
            <button
              className="quiz-mobile-submit"
              onClick={submitQuiz}
              disabled={answeredCount < totalQuestions}
            >
              {answeredCount < totalQuestions
                ? `Answer ${totalQuestions - answeredCount} more`
                : "Submit Quiz"}
            </button>
          </div>
        </>
      )}

      {quizState === "results" && currentQuiz && quizScore && (
        <>
          <div className="quiz-mobile-header">
            <button className="quiz-mobile-back" onClick={startNewQuiz}>
              ← New Quiz
            </button>
          </div>

          <div className="quiz-mobile-content">
            <h2 className="quiz-mobile-title">Quiz Results</h2>

            <div className="quiz-mobile-score">
              <div className="quiz-mobile-score-circle">
                {quizScore.percentage}%
              </div>
              <div className="quiz-mobile-score-text">Overall Score</div>
            </div>

            <div className="quiz-mobile-stats">
              <div className="quiz-mobile-stat">
                <div className="quiz-mobile-stat-value correct">
                  {quizScore.correctCount}
                </div>
                <div className="quiz-mobile-stat-label">Correct</div>
              </div>
              <div className="quiz-mobile-stat">
                <div className="quiz-mobile-stat-value incorrect">
                  {quizScore.totalQuestions - quizScore.correctCount}
                </div>
                <div className="quiz-mobile-stat-label">Incorrect</div>
              </div>
              <div className="quiz-mobile-stat">
                <div className="quiz-mobile-stat-value">
                  {quizScore.earnedPoints}/{quizScore.totalPoints}
                </div>
                <div className="quiz-mobile-stat-label">Points</div>
              </div>
            </div>

            <div className="quiz-mobile-actions">
              <button className="quiz-mobile-retake" onClick={retakeQuiz}>
                Retake Quiz
              </button>
            </div>

            <div className="quiz-mobile-review-section">
              <h3 className="quiz-mobile-review-title">Review Answers</h3>
              {currentQuiz.questions.map((question, index) => {
                const userAnswer = userAnswers[question.id];
                let isCorrect;

                if (question.type === "short-answer") {
                  isCorrect =
                    userAnswer?.toLowerCase().trim() ===
                    question.correctAnswer?.toLowerCase().trim();
                } else {
                  isCorrect = userAnswer === question.correctAnswer;
                }

                return (
                  <div
                    key={question.id}
                    className={`quiz-mobile-review ${
                      isCorrect ? "correct" : "incorrect"
                    }`}
                  >
                    <div className="quiz-mobile-review-header">
                      <span className="quiz-mobile-review-num">
                        Q{index + 1}
                      </span>
                      <span
                        className={`quiz-mobile-review-status ${
                          isCorrect ? "correct" : "incorrect"
                        }`}
                      >
                        {isCorrect ? "✓ Correct" : "✗ Incorrect"}
                      </span>
                    </div>
                    <div className="quiz-mobile-review-question">
                      {question.question}
                    </div>

                    {question.type === "short-answer" ? (
                      <>
                        <div className="quiz-mobile-review-answer">
                          <strong>Your answer:</strong>{" "}
                          {userAnswer || "No answer"}
                        </div>
                        <div className="quiz-mobile-review-correct">
                          <strong>Correct answer:</strong>{" "}
                          {question.correctAnswer}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="quiz-mobile-review-answer">
                          <strong>Your answer:</strong>{" "}
                          {userAnswer !== undefined
                            ? question.options[userAnswer]
                            : "No answer"}
                        </div>
                        {!isCorrect && (
                          <div className="quiz-mobile-review-correct">
                            <strong>Correct answer:</strong>{" "}
                            {question.options[question.correctAnswer]}
                          </div>
                        )}
                      </>
                    )}

                    <div className="quiz-mobile-review-explanation">
                      <strong>Explanation:</strong> {question.explanation}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default QuizComponentMobile;
