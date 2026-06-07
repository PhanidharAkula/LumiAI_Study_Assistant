import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getReviewQueue,
  recordReview,
  type ReviewCard,
  type SrsRating,
} from "@shared/services/reviewService";

const RATINGS = [
  { value: "again", label: "Again", hint: "Forgot" },
  { value: "hard", label: "Hard", hint: "Tough" },
  { value: "good", label: "Good", hint: "Got it" },
  { value: "easy", label: "Easy", hint: "Easy" },
] as const;

// Per-rating background + hover (the only thing that differs between the four).
const RATE_STYLE: Record<string, string> = {
  again: "bg-[#fde2e2] hover:bg-[#f9cfcf]",
  hard: "bg-[#fdecc8] hover:bg-[#f9dfa6]",
  good: "bg-[#d9f0e0] hover:bg-[#c6e7d1]",
  easy: "bg-[#dbeafe] hover:bg-[#c6dcfb]",
};
// translateZ(0) promotes each button to its own compositing layer so its hard
// box-shadow is composited with it and cleared cleanly when the button unmounts
// or shifts position (the card collapses on rating) — without this, Safari/WebKit
// leaves a "ghost" of the shadow in the area the button vacated.
const RATE_BTN =
  "flex flex-col items-center gap-0.5 rounded-xl border-[1.5px] border-solid border-ink px-1.5 py-3 text-ink shadow-[0px_2px_0_#000] [transform:translateZ(0)] disabled:cursor-wait disabled:opacity-60 max-[600px]:px-1";

// Empty/done-state card (shared by the three terminal states).
const EMPTY =
  "flex cursor-default flex-col items-center gap-2.5 rounded-[18px] border-[1.5px] border-solid border-ink bg-white px-7 py-10 text-center shadow-[0px_3px_0_#000]";
const EMPTY_TITLE = "text-[1.3rem] font-bold";
const EMPTY_TEXT = "max-w-[420px] leading-[1.55] text-muted";
const PRIMARY_BTN =
  "mt-3 rounded-full border-[1.5px] border-solid border-ink bg-sage px-7 py-3 text-[1rem] font-semibold text-ink hover:bg-[#82b5b5]";

const Review = () => {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<ReviewCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasDecks, setHasDecks] = useState(true);
  const [reviewed, setReviewed] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { cards, hasDecks: decks } = await getReviewQueue();
      if (!active) return;
      setQueue(cards);
      setHasDecks(decks);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const current = queue[index];

  const handleRate = async (rating: SrsRating) => {
    if (!current || saving) return;
    setSaving(true);
    const { srs } = await recordReview(current, rating);
    setReviewed((n) => n + 1);
    if (rating === "again") {
      // Re-queue this card (with its updated state) to the end of the session.
      setQueue((prev) => [...prev, { ...current, srs }]);
    }
    setIndex((i) => i + 1);
    setFlipped(false);
    setSaving(false);
  };

  const goDashboard = () => navigate("/dashboard");

  const remaining = Math.max(0, queue.length - index);
  const inSession =
    !loading && hasDecks && queue.length > 0 && index < queue.length;

  return (
    <div className="relative min-h-[100dvh] w-full px-5 pt-[84px] pb-[60px] max-[600px]:px-3.5 max-[600px]:pt-[72px] max-[600px]:pb-10">
      <button
        className="back-button absolute left-6 top-6 z-[2] hover:bg-[#82b5b5] max-[600px]:left-4 max-[600px]:top-4"
        onClick={goDashboard}
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

      <div className="mx-auto max-w-[600px]">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="cursor-default text-[1.8rem] font-bold">Daily Review</h1>
          {inSession && (
            <span className="cursor-default rounded-full border-[1.5px] border-solid border-ink bg-sage px-3.5 py-1 text-[0.9rem] font-semibold">
              {remaining} left
            </span>
          )}
        </div>

        {loading ? (
          <div className="cursor-default py-[60px] text-center text-muted">
            Loading your cards…
          </div>
        ) : !hasDecks ? (
          <div className={EMPTY}>
            <div className="text-[2.6rem]" aria-hidden="true">
              🗂️
            </div>
            <p className={EMPTY_TITLE}>No flashcards yet</p>
            <p className={EMPTY_TEXT}>
              Generate flashcards from your class materials first, then come back
              to review them here.
            </p>
            <button className={PRIMARY_BTN} onClick={goDashboard}>
              Go to my classes
            </button>
          </div>
        ) : queue.length === 0 ? (
          <div className={EMPTY}>
            <div className="text-[2.6rem]" aria-hidden="true">
              ✅
            </div>
            <p className={EMPTY_TITLE}>You&apos;re all caught up!</p>
            <p className={EMPTY_TEXT}>
              No cards are due right now. Check back later — spaced repetition
              brings them around right when you&apos;re about to forget.
            </p>
            <button className={PRIMARY_BTN} onClick={goDashboard}>
              Back to dashboard
            </button>
          </div>
        ) : index >= queue.length ? (
          <div className={EMPTY}>
            <div className="text-[2.6rem]" aria-hidden="true">
              🎉
            </div>
            <p className={EMPTY_TITLE}>Session complete</p>
            <p className={EMPTY_TEXT}>
              You reviewed {reviewed} card{reviewed === 1 ? "" : "s"}. Nice work —
              your next batch will be ready when those cards come due.
            </p>
            <button className={PRIMARY_BTN} onClick={goDashboard}>
              Back to dashboard
            </button>
          </div>
        ) : (
          <>
            <div
              key={`${current.deckId}:${current.cardIndex}:${index}`}
              className="flex min-h-[240px] cursor-default flex-col rounded-[18px] border-[1.5px] border-solid border-ink bg-white p-7 shadow-[0px_3px_0_#000]"
            >
              <div className="mb-[18px] flex flex-wrap items-center gap-2">
                <span className="text-[0.8rem] font-semibold text-muted">
                  {current.className}
                </span>
                {current.srs === null && (
                  <span className="rounded-full bg-[#dbeafe] px-[9px] py-0.5 text-[0.7rem] font-bold text-[#1e40af]">
                    New
                  </span>
                )}
                {current.category && (
                  <span className="rounded-full border border-solid border-ink bg-sage px-[9px] py-0.5 text-[0.7rem] font-semibold">
                    {current.category}
                  </span>
                )}
              </div>

              <div className="flex flex-1 items-center whitespace-pre-wrap break-words text-[1.4rem] font-semibold leading-[1.4] max-[600px]:text-[1.2rem]">
                {current.front}
              </div>

              {flipped && (
                <div className="block">
                  <div className="my-[18px] h-[1.5px] bg-ink opacity-15" />
                  <div className="whitespace-pre-wrap break-words text-[1.15rem] leading-[1.55] text-ink">
                    {current.back}
                  </div>
                </div>
              )}
            </div>

            {!flipped ? (
              <button
                className="mt-5 w-full rounded-full border-[1.5px] border-solid border-ink bg-sage p-3.5 text-[1rem] font-semibold text-ink shadow-[0px_2px_0_#000] [transform:translateZ(0)] hover:bg-[#82b5b5]"
                onClick={() => setFlipped(true)}
              >
                Show answer
              </button>
            ) : (
              <div className="mt-5 grid grid-cols-4 gap-2.5">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    className={`${RATE_BTN} ${RATE_STYLE[r.value]}`}
                    onClick={() => handleRate(r.value)}
                    disabled={saving}
                  >
                    <span className="text-[0.95rem] font-bold">{r.label}</span>
                    <span className="text-[0.7rem] text-muted max-[600px]:hidden">
                      {r.hint}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Review;
