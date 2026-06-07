import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getProgress,
  type Progress as ProgressData,
} from "@shared/services/progressService";

const streakLine = (n: number) => {
  if (n === 0) return "Study today to start a streak.";
  if (n === 1) return "Nice start. Come back tomorrow to keep it going.";
  if (n < 7) return "You're building momentum. Keep it up!";
  if (n < 30) return "Strong streak. You're on a roll.";
  return "Incredible consistency. You're unstoppable.";
};

// Shared white "sticker" card look used by the streak hero / stat / mastery cards.
const CARD =
  "rounded-[14px] border-[1.5px] border-solid border-ink bg-white shadow-[0px_2px_0_#000]";

const Progress = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ProgressData | null>(null);
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
    <div className="relative min-h-[100dvh] w-full px-5 pt-[84px] pb-[60px] max-[600px]:px-3.5 max-[600px]:pt-[72px] max-[600px]:pb-10">
      <button
        className="back-button absolute left-6 top-6 z-[2] max-[600px]:left-4 max-[600px]:top-4"
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

      <div className="mx-auto max-w-[640px]">
        <h1 className="mb-6 cursor-default text-center text-[1.8rem] font-bold">
          Your Progress
        </h1>

        {loading ? (
          <div className="cursor-default py-[60px] text-center text-muted">
            Loading your progress…
          </div>
        ) : !data || !data.hasActivity ? (
          <div className="flex cursor-default flex-col items-center gap-2.5 rounded-[18px] border-[1.5px] border-solid border-ink bg-white px-7 py-10 text-center shadow-[0px_3px_0_#000]">
            <div className="text-[2.6rem]" aria-hidden="true">
              📈
            </div>
            <p className="text-[1.3rem] font-bold">No activity yet</p>
            <p className="max-w-[420px] leading-[1.55] text-muted">
              Chat with Lumi, take a quiz, or review some flashcards. Your streak
              and progress will start showing up here.
            </p>
            <button
              className="mt-3 rounded-full border-[1.5px] border-solid border-ink bg-sage px-7 py-3 text-[1rem] font-semibold text-ink shadow-[0px_2px_0_#000]"
              onClick={() => navigate("/dashboard")}
            >
              Start studying
            </button>
          </div>
        ) : (
          <>
            {/* Streak hero */}
            <div className="mb-5 cursor-default rounded-[18px] border-[1.5px] border-solid border-ink bg-white px-6 py-8 text-center shadow-[0px_3px_0_#000]">
              <div className="text-[2.6rem] leading-none" aria-hidden="true">
                🔥
              </div>
              <div className="mt-1.5 text-[3.4rem] font-extrabold leading-[1.1] max-[600px]:text-[3rem]">
                {data.currentStreak}
              </div>
              <div className="text-[1rem] font-semibold uppercase tracking-[1px] text-muted">
                day{data.currentStreak === 1 ? "" : "s"} streak
              </div>
              <div className="mt-3 font-medium">
                {streakLine(data.currentStreak)}
              </div>
              {data.longestStreak > 0 && (
                <div className="mt-1.5 text-[0.85rem] text-muted">
                  Longest streak: {data.longestStreak} day
                  {data.longestStreak === 1 ? "" : "s"}
                </div>
              )}
            </div>

            {/* Stat cards */}
            <div className="mb-9 grid grid-cols-3 gap-3 max-[600px]:grid-cols-1 max-[600px]:gap-2.5">
              <div
                className={`${CARD} cursor-default px-3 py-[18px] text-center max-[600px]:flex max-[600px]:items-baseline max-[600px]:justify-between max-[600px]:px-4 max-[600px]:py-3.5 max-[600px]:text-left`}
              >
                <div className="text-[1.9rem] font-extrabold leading-none">
                  {data.cardsReviewedThisWeek}
                </div>
                <div className="mt-2 text-[0.78rem] leading-[1.35] text-muted max-[600px]:mt-0">
                  Cards reviewed this week
                </div>
              </div>
              <div
                className={`${CARD} cursor-default px-3 py-[18px] text-center max-[600px]:flex max-[600px]:items-baseline max-[600px]:justify-between max-[600px]:px-4 max-[600px]:py-3.5 max-[600px]:text-left`}
              >
                <div className="text-[1.9rem] font-extrabold leading-none">
                  {data.quizzesTaken}
                </div>
                <div className="mt-2 text-[0.78rem] leading-[1.35] text-muted max-[600px]:mt-0">
                  Quizzes taken
                  {data.avgQuizScore !== null
                    ? ` · ${data.avgQuizScore}% avg`
                    : ""}
                </div>
              </div>
              <div
                className={`${CARD} cursor-default px-3 py-[18px] text-center max-[600px]:flex max-[600px]:items-baseline max-[600px]:justify-between max-[600px]:px-4 max-[600px]:py-3.5 max-[600px]:text-left`}
              >
                <div className="text-[1.9rem] font-extrabold leading-none">
                  {data.totalCardsStudied}
                </div>
                <div className="mt-2 text-[0.78rem] leading-[1.35] text-muted max-[600px]:mt-0">
                  Cards studied total
                </div>
              </div>
            </div>

            {/* Per-class mastery */}
            {data.classMastery.length > 0 && (
              <>
                <h2 className="mb-1 cursor-default text-[1.25rem] font-bold">
                  Mastery by class
                </h2>
                <p className="mb-4 cursor-default text-[0.85rem] text-muted">
                  Share of each class&apos;s cards you&apos;ve learned well
                  through review.
                </p>
                <div className="flex flex-col gap-4">
                  {data.classMastery.map((c) => (
                    <div
                      key={c.id}
                      className={`${CARD} cursor-default px-[18px] py-4`}
                    >
                      <div className="mb-2.5 flex items-center justify-between gap-3">
                        <span className="break-words font-semibold">
                          {c.name}
                        </span>
                        <span className="shrink-0 font-extrabold">
                          {c.mastery}%
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full border-[1.5px] border-solid border-ink bg-cream">
                        <div
                          className="h-full rounded-full bg-sage [transition:width_0.4s_ease]"
                          style={{ width: `${c.mastery}%` }}
                        />
                      </div>
                      <div className="mt-2 text-[0.8rem] text-muted">
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
