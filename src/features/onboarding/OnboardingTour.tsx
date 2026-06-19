/**
 * OnboardingTour - the first-run welcome takeover.
 *
 * A cinematic, self-contained celestial tour shown once to brand-new users
 * (and replayable from the profile menu). Built as a portal takeover like the
 * file viewer / chat (NOT a Modal) so it can run its own two-pane night-hero
 * layout and step transitions, while reusing the shared overlay behaviors
 * (scroll-lock, Escape stack, focus capture) so it stacks correctly app-wide.
 *
 * Motion doctrine (see the kit headers): framer owns transform/opacity;
 * Starfield/LumiStar supply the ambient celestial texture.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Constellation,
  CornerTicks,
  LumiStar,
  Starfield,
  UI,
} from "@shared/components/atlas";
import { Button } from "@shared/components/controls";
import { modalPop, scrimFade, spring } from "@shared/motion";
import { useEscapeToClose, useScrollLock } from "@shared/hooks/overlay";

interface OnboardingTourProps {
  open: boolean;
  /** Skip / finish / Escape - the parent marks the tour seen here. */
  onClose: () => void;
  /** Final CTA for new users. When present the last step offers to create the
   *  first class (the parent should close the tour + open the create form). */
  onCreateClass?: () => void;
  /** Optional name for a warm first step ("Welcome, Alex"). */
  userName?: string | null;
}

interface Step {
  fig: string;
  overline: string;
  title: string;
  body: string;
  glyph: ReactNode;
}

/* Shared stroked-icon frame - matches the app's lucide-style iconography. */
function Glyph({ children, size = 110 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const GOLD = "var(--color-gold)";

/* Step-change motion. `custom` carries the direction (1 = forward, -1 = back). */
const glyphVariants: Variants = {
  enter: (d: number) => ({ opacity: 0, scale: 0.9, x: d > 0 ? 26 : -26 }),
  center: { opacity: 1, scale: 1, x: 0, transition: spring.gentle },
  exit: (d: number) => ({
    opacity: 0,
    scale: 0.92,
    x: d > 0 ? -22 : 22,
    transition: { duration: 0.18 },
  }),
};

const textVariants: Variants = {
  enter: (d: number) => ({ opacity: 0, x: d > 0 ? 28 : -28 }),
  center: { opacity: 1, x: 0, transition: spring.gentle },
  exit: (d: number) => ({
    opacity: 0,
    x: d > 0 ? -20 : 20,
    transition: { duration: 0.16 },
  }),
};

const OnboardingTour = ({
  open,
  onClose,
  onCreateClass,
  userName,
}: OnboardingTourProps) => {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

  useScrollLock(open);
  useEscapeToClose(open, onClose);

  const firstName = userName?.trim().split(/\s+/)[0];

  const steps = useMemo<Step[]>(
    () => [
      {
        fig: "Fig. 01",
        overline: "Welcome aboard",
        title: firstName ? `Welcome, ${firstName}` : "Welcome to Lumi",
        body: "Lumi turns your course materials into an interactive study universe - ask questions, generate quizzes and flashcards, and review what matters until it sticks.",
        glyph: (
          <div className="text-starlight/65">
            <LumiStar
              size={148}
              orbit
              breathe
              rays={GOLD}
              core="var(--color-starlight)"
            />
          </div>
        ),
      },
      {
        fig: "Fig. 02",
        overline: "Step 01 - Your classes",
        title: "Chart a class for each subject",
        body: "Create a class for every course or topic. Each one is a private space that holds its materials and everything Lumi makes from them.",
        glyph: (
          <div className="relative h-37 w-37 text-starlight">
            <Constellation
              name="Biology"
              size={146}
              goldAlpha
              className="relative z-10"
            />
            <Constellation
              name="History 204"
              size={62}
              goldAlpha={false}
              twinkle={false}
              className="absolute -left-7 -top-3 text-starlight/35"
            />
            <Constellation
              name="Calculus II"
              size={54}
              goldAlpha={false}
              twinkle={false}
              className="absolute -bottom-4 -right-6 text-starlight/30"
            />
          </div>
        ),
      },
      {
        fig: "Fig. 03",
        overline: "Step 02 - Materials",
        title: "Bring in your notes",
        body: "Upload PDFs, slides, notes, and images. Lumi reads them, so every answer, quiz, and card stays grounded in your own material.",
        glyph: (
          <div className="text-starlight">
            <Glyph size={104}>
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <polyline points="14 3 14 8 19 8" />
              <g stroke={GOLD}>
                <line x1="12" y1="17.5" x2="12" y2="11" />
                <polyline points="9.5 13.2 12 10.7 14.5 13.2" />
              </g>
            </Glyph>
          </div>
        ),
      },
      {
        fig: "Fig. 04",
        overline: "Step 03 - Ask Lumi",
        title: "Chat or talk it through",
        body: "Ask Lumi to explain a concept, summarize a chapter, or work through a problem - by text in Chat, or hands-free in Talk.",
        glyph: (
          <div className="text-starlight">
            <Glyph size={104}>
              <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-3.8-.8L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
              <g stroke={GOLD}>
                <line x1="8.5" y1="11.6" x2="8.5" y2="13.4" />
                <line x1="11" y1="9.6" x2="11" y2="15.4" />
                <line x1="13.5" y1="8.4" x2="13.5" y2="16.6" />
                <line x1="16" y1="10.6" x2="16" y2="14.4" />
              </g>
            </Glyph>
          </div>
        ),
      },
      {
        fig: "Fig. 05",
        overline: "Step 04 - Practice",
        title: "Test yourself, make it stick",
        body: "Generate quizzes and flashcards in a tap. Review brings cards back right before you'd forget, while Progress tracks your streaks and mastery.",
        glyph: (
          <div className="text-starlight">
            <Glyph size={104}>
              <rect
                x="5.5"
                y="4.5"
                width="13"
                height="9"
                rx="2"
                transform="rotate(-9 12 9)"
                opacity="0.45"
              />
              <rect x="5" y="9" width="14" height="10.5" rx="2" />
              <polyline
                points="8.6 14.2 11 16.6 15.4 11.6"
                stroke={GOLD}
              />
            </Glyph>
          </div>
        ),
      },
      {
        fig: "Fig. 06",
        overline: "Ready to begin",
        title: "Your sky awaits",
        body: "Start by charting your first class, add a few materials, and let Lumi do the rest.",
        glyph: (
          <div className="relative text-gold">
            <LumiStar
              size={134}
              breathe
              rays={GOLD}
              core="var(--color-starlight)"
            />
            <span
              className="absolute -right-1 top-3 font-mono text-[15px] text-gold/80"
              aria-hidden="true"
            >
              ✦
            </span>
            <span
              className="absolute -left-2 bottom-5 font-mono text-[11px] text-starlight/70"
              aria-hidden="true"
            >
              ✦
            </span>
          </div>
        ),
      },
    ],
    [firstName]
  );

  const last = steps.length - 1;
  const isLast = step === last;
  const isFirst = step === 0;

  // Reset to the first step whenever the tour (re)opens - before paint, so a
  // replay never flashes the previously-viewed step.
  useLayoutEffect(() => {
    if (open) {
      setStep(0);
      setDir(1);
    }
  }, [open]);

  const goTo = useCallback((i: number, d: number) => {
    setDir(d);
    setStep(i);
  }, []);

  const finish = useCallback(() => {
    if (onCreateClass) onCreateClass();
    else onClose();
  }, [onCreateClass, onClose]);

  const next = useCallback(() => {
    if (step < last) goTo(step + 1, 1);
    else finish();
  }, [step, last, goTo, finish]);

  const back = useCallback(() => {
    if (step > 0) goTo(step - 1, -1);
  }, [step, goTo]);

  // Arrow-key navigation while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back]);

  // Focus the plate on open; hand focus back on close.
  const plateRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement as HTMLElement | null;
      plateRef.current?.focus();
    } else {
      restoreRef.current?.focus?.();
      restoreRef.current = null;
    }
  }, [open]);

  const current = steps[step]!;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[var(--z-tour)] flex items-center justify-center bg-night/75 px-5 py-6 backdrop-blur-[3px] max-md:px-4 max-md:py-5"
          variants={scrimFade}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            ref={plateRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Welcome to Lumi"
            className="relative flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-x-hidden overflow-y-auto rounded-2xl bg-vellum shadow-float outline-none max-md:max-h-[88dvh] max-md:min-h-[564px]"
            variants={modalPop}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Body: night hero + content (stacks on phones). */}
            <div className="relative flex flex-1 overflow-hidden md:min-h-[500px] max-md:flex-col">
              {/* Hero - night plate with ambient starfield + the step glyph. */}
              <div className="relative flex w-[42%] shrink-0 items-center justify-center overflow-hidden bg-night p-10 text-starlight max-md:h-50 max-md:w-full max-md:p-6">
                <Starfield count={48} seed={7} goldRatio={0.18} />
                <CornerTicks className="text-starlight/20" inset={12} length={10} />
                <span
                  className={`absolute left-5 top-4 z-10 ${UI.overlineNight} opacity-70`}
                >
                  {current.fig}
                </span>
                <AnimatePresence mode="wait" custom={dir} initial={false}>
                  <motion.div
                    key={step}
                    custom={dir}
                    variants={glyphVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="relative z-10 flex items-center justify-center"
                  >
                    <div className="max-md:scale-[0.82]">{current.glyph}</div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Content - overline, title, body. */}
              <div className="relative flex flex-1 flex-col justify-center px-10 py-12 max-md:justify-start max-md:px-6 max-md:pb-7 max-md:pt-8">
                <AnimatePresence mode="wait" custom={dir} initial={false}>
                  <motion.div
                    key={step}
                    custom={dir}
                    variants={textVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    <p className={UI.overline}>{current.overline}</p>
                    <h2 className="mt-3 font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.01em] text-ink max-md:text-[26px]">
                      {current.title}
                    </h2>
                    <p className="mt-4 max-w-md text-[16px] leading-[1.6] text-ink/75 max-md:text-[15px]">
                      {current.body}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Footer: skip | progress ticks | back + next. Stacks on phones so
                the long final CTA never overflows the row. */}
            <footer className="flex flex-wrap items-center gap-x-0 gap-y-3 border-0 border-t border-solid border-line bg-cream/40 px-7 py-4 max-md:px-4 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-3">
              {/* Skip - left of the button row on mobile, left column on
                  desktop (short label on phones so it fits beside the buttons). */}
              <button
                type="button"
                onClick={onClose}
                className={`order-2 mr-auto cursor-pointer justify-self-start rounded-md border-0 bg-transparent px-1 py-1 text-[13px] font-medium text-muted transition-colors hover:text-ink md:order-none md:mr-0 ${
                  isLast ? "invisible" : ""
                }`}
              >
                <span className="md:hidden">Skip</span>
                <span className="hidden md:inline">Skip tour</span>
              </button>

              <div
                className="order-1 flex basis-full items-center justify-center gap-2 justify-self-center md:order-none md:basis-auto"
                aria-label="Tour progress"
              >
                {steps.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goTo(i, i > step ? 1 : -1)}
                    aria-label={`Go to ${s.overline}`}
                    aria-current={i === step ? "step" : undefined}
                    className="flex h-6 w-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none"
                  >
                    <span
                      aria-hidden="true"
                      className={`font-mono transition-all duration-200 ${
                        i === step
                          ? "text-[14px] text-gold"
                          : i < step
                            ? "text-[11px] text-gold-deep/70"
                            : "text-[11px] text-ink/25"
                      }`}
                    >
                      ✦
                    </span>
                  </button>
                ))}
              </div>

              <div className="order-3 flex items-center justify-end gap-2.5 max-md:gap-2 md:order-none md:justify-self-end">
                {/* Back is always rendered (invisible on step 1) so its slot is
                    reserved and the Next button never shifts between steps. */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={back}
                  disabled={isFirst}
                  aria-hidden={isFirst || undefined}
                  className={`max-md:px-3! ${isFirst ? "invisible" : ""}`}
                >
                  Back
                </Button>
                <Button
                  variant={isLast ? "gold" : "primary"}
                  size="sm"
                  onClick={next}
                  className="relative max-md:px-3!"
                >
                  {/* Invisible sizer = the widest label, so the button keeps a
                      constant width across every step (no layout shift). */}
                  <span
                    aria-hidden="true"
                    className="invisible inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    Create your first class
                    <span className="text-[12px]">✦</span>
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center gap-2">
                    {isLast
                      ? onCreateClass
                        ? "Create your first class"
                        : "Start exploring"
                      : "Next"}
                    {isLast && (
                      <span aria-hidden="true" className="text-[12px]">
                        ✦
                      </span>
                    )}
                  </span>
                </Button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default OnboardingTour;
