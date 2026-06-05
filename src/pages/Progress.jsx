import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getProgress } from "../services/progressService";
import "./Progress.css";

const streakLine = (n) => {
  if (n === 0) return "Study today to start a streak.";
  if (n === 1) return "Nice start. Come back tomorrow to keep it going.";
  if (n < 7) return "You're building momentum. Keep it up!";
  if (n < 30) return "Strong streak. You're on a roll.";
  return "Incredible consistency. You're unstoppable.";
};

const Progress = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const p = await getProgress();
      if (active) {
        setData(p);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="progress-page">
      <button
        className="back-button progress-back"
        onClick={() => navigate("/dashboard")}
        aria-label="Back to dashboard"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
      </button>

      <div className="progress-content">
        <h1 className="progress-title">Your Progress</h1>

        {loading ? (
          <div className="progress-status">Loading your progress…</div>
        ) : !data || !data.hasActivity ? (
          <div className="progress-empty">
            <div className="progress-empty-emoji" aria-hidden="true">
              📈
            </div>
            <p className="progress-empty-title">No activity yet</p>
            <p className="progress-empty-text">
              Chat with Lumi, take a quiz, or review some flashcards. Your streak
              and progress will start showing up here.
            </p>
            <button
              className="progress-primary-btn"
              onClick={() => navigate("/dashboard")}
            >
              Start studying
            </button>
          </div>
        ) : (
          <>
            {/* Streak hero */}
            <div className="progress-streak-card">
              <div className="progress-streak-flame" aria-hidden="true">
                🔥
              </div>
              <div className="progress-streak-number">{data.currentStreak}</div>
              <div className="progress-streak-label">
                day{data.currentStreak === 1 ? "" : "s"} streak
              </div>
              <div className="progress-streak-sub">
                {streakLine(data.currentStreak)}
              </div>
              {data.longestStreak > 0 && (
                <div className="progress-streak-best">
                  Longest streak: {data.longestStreak} day
                  {data.longestStreak === 1 ? "" : "s"}
                </div>
              )}
            </div>

            {/* Stat cards */}
            <div className="progress-stats">
              <div className="progress-stat">
                <div className="progress-stat-value">
                  {data.cardsReviewedThisWeek}
                </div>
                <div className="progress-stat-label">Cards reviewed this week</div>
              </div>
              <div className="progress-stat">
                <div className="progress-stat-value">{data.quizzesTaken}</div>
                <div className="progress-stat-label">
                  Quizzes taken
                  {data.avgQuizScore !== null
                    ? ` · ${data.avgQuizScore}% avg`
                    : ""}
                </div>
              </div>
              <div className="progress-stat">
                <div className="progress-stat-value">
                  {data.totalCardsStudied}
                </div>
                <div className="progress-stat-label">Cards studied total</div>
              </div>
            </div>

            {/* Per-class mastery */}
            {data.classMastery.length > 0 && (
              <>
                <h2 className="progress-section-title">Mastery by class</h2>
                <p className="progress-section-hint">
                  Share of each class&apos;s cards you&apos;ve learned well
                  through review.
                </p>
                <div className="progress-mastery-list">
                  {data.classMastery.map((c) => (
                    <div key={c.id} className="progress-mastery-row">
                      <div className="progress-mastery-head">
                        <span className="progress-mastery-name">{c.name}</span>
                        <span className="progress-mastery-pct">
                          {c.mastery}%
                        </span>
                      </div>
                      <div className="progress-mastery-track">
                        <div
                          className="progress-mastery-fill"
                          style={{ width: `${c.mastery}%` }}
                        />
                      </div>
                      <div className="progress-mastery-meta">
                        {c.mastered} of {c.total} cards mastered
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Progress;
