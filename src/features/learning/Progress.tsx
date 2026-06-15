import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  getProgress,
  type Progress as ProgressData,
} from "@shared/services/progressService";
import {
  Constellation,
  CornerTicks,
  UI,
  starPath,
} from "@shared/components/atlas";
import { BackButton, Button, Spinner } from "@shared/components/controls";
import { fadeRise, fadeRiseSoft, stagger } from "@shared/motion";

const streakLine = (n: number) => {
  if (n === 0) return "Study today to start a streak.";
  if (n === 1) return "Nice start. Come back tomorrow to keep it going.";
  if (n < 7) return "You're building momentum. Keep it up!";
  if (n < 30) return "Strong streak. You're on a roll.";
  return "Incredible consistency. You're unstoppable.";
};

// Instrument-readout stat card: column on desktop (glyph, mono label, Fraunces
// number), a single row on small screens. Entrance comes from framer
// (fadeRise under the stagger parent), not CSS.
const STAT_CARD = `${UI.plate} cursor-default px-3 py-5 text-center max-[600px]:flex max-[600px]:items-center max-[600px]:justify-between max-[600px]:gap-3 max-[600px]:px-4 max-[600px]:py-3.5 max-[600px]:text-left`;
const STAT_HEAD =
  "flex flex-col items-center gap-2 max-[600px]:flex-row max-[600px]:gap-2.5";
const STAT_NUM =
  "mt-2.5 font-display text-[32px] font-semibold leading-none max-[600px]:mt-0 max-[600px]:shrink-0";

/* Tiny stroke glyphs - hand-engraved instruments, one gold accent each. */
const GlyphCards = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <g
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <rect x="7.5" y="3.5" width="13" height="9.5" rx="1.6" opacity="0.5" />
      <rect
        x="3.5"
        y="9"
        width="13"
        height="9.5"
        rx="1.6"
        fill="var(--color-vellum)"
      />
    </g>
    <path d={starPath(10, 13.75, 2.1)} fill="var(--color-gold)" />
  </svg>
);

const GlyphDial = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <g
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2.2 V4.2 M12 19.8 V21.8 M2.2 12 H4.2 M19.8 12 H21.8" />
      <path d={starPath(12, 12, 5)} />
    </g>
    <path
      d={starPath(12, 12, 2.6)}
      transform="rotate(45 12 12)"
      fill="var(--color-gold)"
      opacity="0.9"
    />
  </svg>
);

const GlyphTome = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <g
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 8 C10.2 6.5 7 6.3 4.8 7.3 V18 C7 17 10.2 17.2 12 18.7" />
      <path d="M12 8 C13.8 6.5 17 6.3 19.2 7.3 V18 C17 17 13.8 17.2 12 18.7" />
      <path d="M12 8 V18.7" />
    </g>
    <path d={starPath(12, 3.4, 1.9)} fill="var(--color-gold)" />
  </svg>
);

const Progress = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const p = await getProgress();
      if (!active) return;
      if (p === null) setError(true);
      else setData(p);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const retry = async () => {
    setLoading(true);
    setError(false);
    const p = await getProgress();
    if (p === null) setError(true);
    else setData(p);
    setLoading(false);
  };

  return (
    <div className="relative min-h-dvh w-full px-5 pt-21 pb-15 max-[600px]:px-3.5 max-[600px]:pt-18 max-[600px]:pb-10">
      {/* Faint sky behind the charts. */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <Constellation
          name="your sky so far"
          size={440}
          twinkle
          className="absolute -right-28 -top-16 text-ink/10"
        />
      </div>

      <BackButton
        className="absolute left-6 top-6 z-2 max-[600px]:left-4 max-[600px]:top-4"
        onClick={() => navigate("/dashboard")}
        label="Back to dashboard"
      />

      <div className="relative z-1 mx-auto max-w-160">
        <p className={`${UI.overline} cursor-default text-center`}>
          Fig. 1 - Your sky so far
        </p>
        <h1 className="mb-7 mt-3 cursor-default text-center font-display text-[36px] font-semibold leading-[1.12] tracking-[-0.01em] max-[600px]:text-[28px]">
          Your{" "}
          <em className="[font-variation-settings:'SOFT'_60,'WONK'_1]">
            Progress
          </em>
        </h1>

        {loading ? (
          <div className="flex justify-center py-15">
            <Spinner label="Loading your progress…" />
          </div>
        ) : error ? (
          <motion.div
            className={`${UI.plate} flex cursor-default flex-col items-center gap-3 px-7 py-12 text-center`}
            variants={fadeRise}
            initial="hidden"
            animate="visible"
          >
            <CornerTicks />
            <Constellation
              name="your sky so far"
              size={120}
              className="text-ink/45"
            />
            <p className={`mt-1 ${UI.overline}`}>Couldn't load your progress</p>
            <p className="max-w-105 font-display italic text-[17px] leading-[1.6] text-muted">
              Something went wrong. Please try again in a moment.
            </p>
            <div className="mt-2 flex gap-2.5">
              <Button onClick={retry}>Try again</Button>
              <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                Back to dashboard
              </Button>
            </div>
          </motion.div>
        ) : !data || !data.hasActivity ? (
          <motion.div
            className={`${UI.plate} flex cursor-default flex-col items-center gap-3 px-7 py-12 text-center`}
            variants={fadeRise}
            initial="hidden"
            animate="visible"
          >
            <CornerTicks />
            <Constellation
              name="your sky so far"
              size={120}
              className="text-ink/45"
            />
            <p className={`mt-1 ${UI.overline}`}>Nothing charted yet</p>
            <p className="max-w-105 font-display italic text-[17px] leading-[1.6] text-muted">
              Chat with Lumi, take a quiz, or review some flashcards. Your
              streak and progress will start showing up here.
            </p>
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => navigate("/dashboard")}
            >
              Start studying
            </Button>
          </motion.div>
        ) : (
          <motion.div variants={stagger()} initial="hidden" animate="visible">
            {/* Streak hero - the screen's instrument: a slow orbit ring with a
                gold star circling the day count. */}
            <motion.div
              className={`${UI.plate} mb-5 cursor-default px-6 py-9 text-center max-[600px]:py-7`}
              variants={fadeRise}
            >
              <CornerTicks />
              <div className="relative mx-auto h-54 w-54 max-[600px]:h-45 max-[600px]:w-45">
                <svg
                  viewBox="0 0 216 216"
                  className="h-full w-full text-ink/50"
                  aria-hidden="true"
                >
                  <circle
                    cx="108"
                    cy="108"
                    r="86"
                    fill="none"
                    stroke="var(--color-ink)"
                    strokeOpacity="0.16"
                    strokeWidth="1"
                  />
                  <g
                    className="animate-orbit-slow"
                    style={{ transformOrigin: "108px 108px" }}
                  >
                    <circle
                      cx="108"
                      cy="108"
                      r="98"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.9"
                      strokeDasharray="0.6 6"
                      strokeLinecap="round"
                      opacity="0.55"
                    />
                    <path d={starPath(108, 10, 6)} fill="var(--color-gold)" />
                  </g>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="font-display text-[56px] font-semibold leading-none tracking-[-0.02em] max-[600px]:text-[46px]">
                    {data.currentStreak}
                  </div>
                  <div className={`mt-2 ${UI.overlineMuted}`}>
                    day{data.currentStreak === 1 ? "" : "s"} streak
                  </div>
                </div>
              </div>
              <p className="mt-4 font-display italic text-[17px] leading-normal text-ink/85">
                {streakLine(data.currentStreak)}
              </p>
              {data.longestStreak > 0 && (
                <p className={`mt-2.5 ${UI.overlineMuted}`}>
                  Longest streak: {data.longestStreak} day
                  {data.longestStreak === 1 ? "" : "s"}
                </p>
              )}
            </motion.div>

            {/* Stat readouts */}
            <div className="mb-9 grid grid-cols-3 gap-3 max-[600px]:grid-cols-1 max-[600px]:gap-2.5">
              <motion.div className={STAT_CARD} variants={fadeRise}>
                <div className={STAT_HEAD}>
                  <GlyphCards />
                  <div className={`${UI.overlineMuted} leading-[1.6]`}>
                    Reviewed this week
                  </div>
                </div>
                <div className={STAT_NUM}>{data.cardsReviewedThisWeek}</div>
              </motion.div>
              <motion.div className={STAT_CARD} variants={fadeRise}>
                <div className={STAT_HEAD}>
                  <GlyphDial />
                  <div className={`${UI.overlineMuted} leading-[1.6]`}>
                    Quizzes taken
                    {data.avgQuizScore !== null
                      ? ` · ${data.avgQuizScore}% avg`
                      : ""}
                  </div>
                </div>
                <div className={STAT_NUM}>{data.quizzesTaken}</div>
              </motion.div>
              <motion.div className={STAT_CARD} variants={fadeRise}>
                <div className={STAT_HEAD}>
                  <GlyphTome />
                  <div className={`${UI.overlineMuted} leading-[1.6]`}>
                    Cards studied total
                  </div>
                </div>
                <div className={STAT_NUM}>{data.totalCardsStudied}</div>
              </motion.div>
            </div>

            {/* Per-class mastery */}
            {data.classMastery.length > 0 && (
              <>
                <motion.h2
                  className="mb-1 cursor-default font-display text-[22px] font-semibold"
                  variants={fadeRiseSoft}
                >
                  Mastery by class
                </motion.h2>
                <motion.p
                  className="mb-4 cursor-default text-[13.5px] leading-[1.6] text-muted"
                  variants={fadeRiseSoft}
                >
                  Share of each class&apos;s cards you&apos;ve learned well
                  through review.
                </motion.p>
                <div className="flex flex-col gap-4">
                  {data.classMastery.map((c) => (
                    <motion.div
                      key={c.id}
                      className={`${UI.plate} cursor-default px-5 py-4`}
                      variants={fadeRiseSoft}
                    >
                      <div className="mb-3 flex items-baseline justify-between gap-3">
                        <span className="wrap-break-word text-[15px] font-semibold">
                          {c.name}
                        </span>
                        <span className="shrink-0 font-display text-[22px] font-semibold leading-none">
                          {c.mastery}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                        <div
                          className="h-full rounded-full bg-verdi/80 [transition:width_0.4s_ease]"
                          style={{ width: `${c.mastery}%` }}
                        />
                      </div>
                      <div className={`mt-2.5 ${UI.overlineMuted}`}>
                        {c.mastered} of {c.total} cards mastered
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Progress;
