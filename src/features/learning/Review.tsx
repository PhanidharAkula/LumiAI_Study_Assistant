import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  getReviewQueue,
  recordReview,
  type ReviewCard,
  type SrsRating,
} from "@shared/services/reviewService";
import { CornerTicks, LumiStar, Starfield, UI } from "@shared/components/atlas";
import { BackButton, Button } from "@shared/components/controls";
import { PageBackdrop } from "@shared/components/PageBackdrop";
import { useLoadingSignal } from "@shared/lib/loadingSignal";
import { fadeRise, pressLift, stagger } from "@shared/motion";

const RATINGS = [
  { value: "again", label: "Again", hint: "Forgot" },
  { value: "hard", label: "Hard", hint: "Tough" },
  { value: "good", label: "Good", hint: "Got it" },
  { value: "easy", label: "Easy", hint: "Easy" },
] as const;

// Per-rating ink: hairline pills that fill with their wash on hover
// (the only thing that differs between the four). The physical lift comes from
// framer (`plateLift`); the class transitions color/border only.
const RATE_STYLE: Record<string, string> = {
  again:
    "border-vermilion/40 text-vermilion hover:border-vermilion hover:bg-vermilion-wash",
  hard: "border-gold-deep/40 text-gold-deep hover:border-gold-deep hover:bg-gold/15",
  good: "border-verdi/40 text-verdi hover:border-verdi hover:bg-verdi/10",
  easy: "border-ink/25 text-ink hover:border-verdi hover:bg-sage/45",
};
const RATE_BTN =
  "flex cursor-pointer flex-col items-center gap-1 rounded-full border border-solid bg-transparent px-1.5 py-3 transition-[color,background-color,border-color] duration-200 disabled:cursor-wait disabled:opacity-60 max-[600px]:px-1";

// Empty/done-state plate (shared by the three terminal states). Entrances come
// from framer (`fadeRise` under a `stagger()` parent) - no `animate-rise`.
const EMPTY = `${UI.plate} flex cursor-default flex-col items-center gap-3 px-7 py-12 text-center`;

const Review = () => {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<ReviewCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasDecks, setHasDecks] = useState(true);
  const [reviewed, setReviewed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { cards, hasDecks: decks, error } = await getReviewQueue();
      if (!active) return;
      setQueue(cards);
      setHasDecks(decks);
      setLoadError(error);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadQueue = async () => {
    setLoading(true);
    setLoadError(false);
    const { cards, hasDecks: decks, error } = await getReviewQueue();
    setQueue(cards);
    setHasDecks(decks);
    setLoadError(error);
    setIndex(0);
    setReviewed(0);
    setLoading(false);
  };

  const current = queue[index];

  const handleRate = async (rating: SrsRating) => {
    if (!current || saving) return;
    setSaving(true);
    setSaveError(false);
    const { srs, error } = await recordReview(current, rating);
    if (error) {
      // Keep the card so the rating can be retried - don't advance and silently
      // lose the scheduling update.
      setSaveError(true);
      setSaving(false);
      return;
    }
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

  const inSession =
    !loading && hasDecks && queue.length > 0 && index < queue.length;

  // Feed the shared app loader on initial load (and retry); render nothing
  // underneath so the one persistent loader covers it (no second spinner).
  useLoadingSignal(loading, "Gathering your cards");

  if (loading) return null;

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden px-5 pt-21 pb-15 max-[480px]:px-3.75 max-[600px]:pt-18 max-[600px]:pb-10">
      <PageBackdrop seed="review ritual" />
      <BackButton
        className="absolute left-6 top-6 z-2 max-[600px]:left-4 max-[600px]:top-4"
        onClick={goDashboard}
        label="Back to dashboard"
      />

      <div className="mx-auto max-w-150 max-[480px]:px-1.25">
        <div className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className={`${UI.overline} cursor-default`}>Spaced review</p>
            <h1 className="mt-2 cursor-default font-display text-[32px] font-semibold leading-[1.08] tracking-[-0.01em] max-[600px]:text-[26px]">
              Daily{" "}
              <em className="[font-variation-settings:'SOFT'_60,'WONK'_1]">
                Review
              </em>
            </h1>
          </div>
          {inSession && (
            <span
              className={`${UI.overlineMuted} cursor-default whitespace-nowrap pb-1.5`}
            >
              {index + 1} of {queue.length}
            </span>
          )}
        </div>

        {loadError ? (
          <motion.div
            className={EMPTY}
            variants={stagger()}
            initial="hidden"
            animate="visible"
          >
            <CornerTicks />
            <motion.div variants={fadeRise}>
              <LumiStar size={44} className="text-ink/40" />
            </motion.div>
            <motion.p className={`mt-1 ${UI.overline}`} variants={fadeRise}>
              Couldn't load your cards
            </motion.p>
            <motion.p
              className="max-w-105 text-[14.5px] leading-[1.65] text-muted"
              variants={fadeRise}
            >
              Something went wrong loading your review queue. Please try again.
            </motion.p>
            <motion.div className="flex gap-2.5" variants={fadeRise}>
              <Button className="mt-2" onClick={loadQueue}>
                Try again
              </Button>
              <Button variant="ghost" className="mt-2" onClick={goDashboard}>
                Back to dashboard
              </Button>
            </motion.div>
          </motion.div>
        ) : !hasDecks ? (
          <motion.div
            className={EMPTY}
            variants={stagger()}
            initial="hidden"
            animate="visible"
          >
            <CornerTicks />
            <motion.div variants={fadeRise}>
              <LumiStar size={44} className="text-ink/40" />
            </motion.div>
            <motion.p className={`mt-1 ${UI.overline}`} variants={fadeRise}>
              No flashcards yet
            </motion.p>
            <motion.p
              className="max-w-105 text-[14.5px] leading-[1.65] text-muted"
              variants={fadeRise}
            >
              Generate flashcards from your class materials first, then come
              back to review them here.
            </motion.p>
            <motion.div variants={fadeRise}>
              <Button variant="ghost" className="mt-2" onClick={goDashboard}>
                Go to my classes
              </Button>
            </motion.div>
          </motion.div>
        ) : queue.length === 0 ? (
          <motion.div
            className={EMPTY}
            variants={stagger()}
            initial="hidden"
            animate="visible"
          >
            <CornerTicks />
            <motion.div variants={fadeRise}>
              <LumiStar size={44} orbit className="text-ink/40" />
            </motion.div>
            <motion.p
              className="mt-1 max-w-105 font-display italic text-[20px] leading-normal text-ink"
              variants={fadeRise}
            >
              All caught up - the sky is quiet tonight.
            </motion.p>
            <motion.p
              className="max-w-105 font-mono text-[11px] leading-[1.8] text-muted"
              variants={fadeRise}
            >
              No cards are due right now. Check back later - spaced repetition
              brings them around right when you&apos;re about to forget.
            </motion.p>
            <motion.div variants={fadeRise}>
              <Button variant="ghost" className="mt-2" onClick={goDashboard}>
                Back to dashboard
              </Button>
            </motion.div>
          </motion.div>
        ) : index >= queue.length ? (
          <motion.div
            className={EMPTY}
            variants={stagger()}
            initial="hidden"
            animate="visible"
          >
            <CornerTicks />
            <motion.div variants={fadeRise}>
              <LumiStar size={44} orbit breathe className="text-ink/40" />
            </motion.div>
            <motion.p className={`mt-1 ${UI.overline}`} variants={fadeRise}>
              Session complete
            </motion.p>
            <motion.p
              className="max-w-105 font-display italic text-[19px] leading-[1.55] text-ink"
              variants={fadeRise}
            >
              You reviewed {reviewed} card{reviewed === 1 ? "" : "s"}. Nice work
              - your next batch will be ready when those cards come due.
            </motion.p>
            <motion.div variants={fadeRise}>
              <Button variant="ghost" className="mt-2" onClick={goDashboard}>
                Back to dashboard
              </Button>
            </motion.div>
          </motion.div>
        ) : (
          <>
            <div
              key={`${current!.deckId}:${current!.cardIndex}:${index}`}
              className={`${UI.plate} flex min-h-60 cursor-default flex-col p-7 max-[600px]:p-5`}
            >
              <CornerTicks />
              <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className={`cursor-default ${UI.overlineMuted}`}>
                  {current!.className}
                </span>
                {current!.srs === null && (
                  <span className="rounded-full border border-solid border-gold-deep/40 bg-gold/15 px-2.5 py-0.75 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-gold-deep">
                    New
                  </span>
                )}
                {current!.category && (
                  <span className="rounded-full border border-solid border-verdi/30 bg-sage/25 px-2.5 py-0.75 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-verdi">
                    {current!.category}
                  </span>
                )}
              </div>

              <div className="flex flex-1 items-center justify-center whitespace-pre-wrap wrap-break-word py-2 text-center font-display text-[24px] font-semibold leading-[1.4] max-[600px]:text-[20px]">
                {current!.front}
              </div>

              {flipped && (
                <div
                  className={`${UI.nightPlate} mt-6 px-6 py-5 max-[600px]:px-5`}
                >
                  <Starfield count={14} seed={9} />
                  <p className={`relative ${UI.overlineNight}`}>Answer</p>
                  <div className="relative mt-2.5 whitespace-pre-wrap wrap-break-word text-[16px] leading-[1.6] text-starlight">
                    {current!.back}
                  </div>
                </div>
              )}
            </div>

            {!flipped ? (
              <Button className="mt-5 w-full" onClick={() => setFlipped(true)}>
                Show answer
              </Button>
            ) : (
              <div className="mt-5 grid grid-cols-4 gap-2.5">
                {RATINGS.map((r) => (
                  <motion.button
                    key={r.value}
                    type="button"
                    className={`${RATE_BTN} ${RATE_STYLE[r.value]}`}
                    onClick={() => handleRate(r.value)}
                    disabled={saving}
                    {...pressLift}
                  >
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
                      {r.label}
                    </span>
                    <span className="text-[10.5px] text-muted max-[600px]:hidden">
                      {r.hint}
                    </span>
                  </motion.button>
                ))}
              </div>
            )}
            {flipped && saveError && (
              <p className="mt-3 text-center text-[12.5px] text-vermilion">
                Couldn't save your rating. Check your connection and try again.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Review;
