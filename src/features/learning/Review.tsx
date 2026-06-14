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
import { BackButton, Button, Spinner } from "@shared/components/controls";
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

  const inSession =
    !loading && hasDecks && queue.length > 0 && index < queue.length;

  return (
    <div className="relative min-h-[100dvh] w-full px-5 pt-[84px] pb-[60px] max-[600px]:px-3.5 max-[600px]:pt-[72px] max-[600px]:pb-10">
      <BackButton
        className="absolute left-6 top-6 z-[2] max-[600px]:left-4 max-[600px]:top-4"
        onClick={goDashboard}
        label="Back to dashboard"
      />

      <div className="mx-auto max-w-[600px]">
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

        {loading ? (
          <div className="flex justify-center py-[60px]">
            <Spinner label="Loading your cards…" />
          </div>
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
              className="max-w-[420px] text-[14.5px] leading-[1.65] text-muted"
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
              className="mt-1 max-w-[420px] font-display italic text-[20px] leading-[1.5] text-ink"
              variants={fadeRise}
            >
              All caught up - the sky is quiet tonight.
            </motion.p>
            <motion.p
              className="max-w-[420px] font-mono text-[11px] leading-[1.8] text-muted"
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
              className="max-w-[420px] font-display italic text-[19px] leading-[1.55] text-ink"
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
              key={`${current.deckId}:${current.cardIndex}:${index}`}
              className={`${UI.plate} flex min-h-[240px] cursor-default flex-col p-7 max-[600px]:p-5`}
            >
              <CornerTicks />
              <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className={`cursor-default ${UI.overlineMuted}`}>
                  {current.className}
                </span>
                {current.srs === null && (
                  <span className="rounded-full border border-solid border-gold-deep/40 bg-gold/15 px-2.5 py-[3px] font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-gold-deep">
                    New
                  </span>
                )}
                {current.category && (
                  <span className="rounded-full border border-solid border-verdi/30 bg-sage/25 px-2.5 py-[3px] font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-verdi">
                    {current.category}
                  </span>
                )}
              </div>

              <div className="flex flex-1 items-center justify-center whitespace-pre-wrap break-words py-2 text-center font-display text-[24px] font-semibold leading-[1.4] max-[600px]:text-[20px]">
                {current.front}
              </div>

              {flipped && (
                <div
                  className={`${UI.nightPlate} mt-6 px-6 py-5 max-[600px]:px-5`}
                >
                  <Starfield count={14} seed={9} />
                  <p className={`relative ${UI.overlineNight}`}>Answer</p>
                  <div className="relative mt-2.5 whitespace-pre-wrap break-words text-[16px] leading-[1.6] text-starlight">
                    {current.back}
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
          </>
        )}
      </div>
    </div>
  );
};

export default Review;
