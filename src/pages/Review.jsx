import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getReviewQueue, recordReview } from "../services/reviewService";
import "./Review.css";

const RATINGS = [
  { value: "again", label: "Again", hint: "Forgot" },
  { value: "hard", label: "Hard", hint: "Tough" },
  { value: "good", label: "Good", hint: "Got it" },
  { value: "easy", label: "Easy", hint: "Easy" },
];

const Review = () => {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
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

  const handleRate = async (rating) => {
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
  const inSession = !loading && hasDecks && queue.length > 0 && index < queue.length;

  return (
    <div className="review-page">
      <button
        className="back-button review-back"
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

      <div className="review-content">
        <div className="review-header">
          <h1 className="review-title">Daily Review</h1>
          {inSession && <span className="review-progress">{remaining} left</span>}
        </div>

        {loading ? (
          <div className="review-status">Loading your cards…</div>
        ) : !hasDecks ? (
          <div className="review-empty">
            <div className="review-empty-emoji" aria-hidden="true">
              🗂️
            </div>
            <p className="review-empty-title">No flashcards yet</p>
            <p className="review-empty-text">
              Generate flashcards from your class materials first, then come back
              to review them here.
            </p>
            <button className="review-primary-btn" onClick={goDashboard}>
              Go to my classes
            </button>
          </div>
        ) : queue.length === 0 ? (
          <div className="review-empty">
            <div className="review-empty-emoji" aria-hidden="true">
              ✅
            </div>
            <p className="review-empty-title">You&apos;re all caught up!</p>
            <p className="review-empty-text">
              No cards are due right now. Check back later — spaced repetition
              brings them around right when you&apos;re about to forget.
            </p>
            <button className="review-primary-btn" onClick={goDashboard}>
              Back to dashboard
            </button>
          </div>
        ) : index >= queue.length ? (
          <div className="review-empty">
            <div className="review-empty-emoji" aria-hidden="true">
              🎉
            </div>
            <p className="review-empty-title">Session complete</p>
            <p className="review-empty-text">
              You reviewed {reviewed} card{reviewed === 1 ? "" : "s"}. Nice work —
              your next batch will be ready when those cards come due.
            </p>
            <button className="review-primary-btn" onClick={goDashboard}>
              Back to dashboard
            </button>
          </div>
        ) : (
          <>
            <div
              key={`${current.deckId}:${current.cardIndex}:${index}`}
              className="review-card"
            >
              <div className="review-card-top">
                <span className="review-card-class">{current.className}</span>
                {current.srs === null && (
                  <span className="review-card-new">New</span>
                )}
                {current.category && (
                  <span className="review-card-tag">{current.category}</span>
                )}
              </div>

              <div className="review-card-front">{current.front}</div>

              {flipped && (
                <div className="review-card-answer">
                  <div className="review-divider" />
                  <div className="review-card-back">{current.back}</div>
                </div>
              )}
            </div>

            {!flipped ? (
              <button
                className="review-show-btn"
                onClick={() => setFlipped(true)}
              >
                Show answer
              </button>
            ) : (
              <div className="review-ratings">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    className={`review-rate-btn review-rate-btn--${r.value}`}
                    onClick={() => handleRate(r.value)}
                    disabled={saving}
                  >
                    <span className="review-rate-label">{r.label}</span>
                    <span className="review-rate-hint">{r.hint}</span>
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
