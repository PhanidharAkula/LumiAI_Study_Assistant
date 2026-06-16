/* eslint-disable react-refresh/only-export-components --
   This file is the design-language kit: components (Constellation, LumiStar…)
   plus their seeding utilities and the UI class vocabulary belong together.
   The only cost is HMR fast-refresh falling back to a full reload when THIS
   file is edited, which is fine for a stable kit. */
/**
 * The Luminarium - shared celestial primitives.
 *
 * Every screen draws from this kit so the whole app speaks one language:
 *  · Constellation - a deterministic star-sign generated from any string
 *    (a class named "Biology" renders the same tiny constellation everywhere).
 *  · LumiStar - the radiant brand star (8-point, gold) with optional orbit.
 *  · Starfield - twinkling micro-stars for night plates.
 *  · CornerTicks - chart-plate registration marks.
 *  · UI - the shared class vocabulary (plates, buttons, inputs, overlines).
 */
import { useMemo } from "react";

/* FNV-1a string hash → 32-bit uint (stable across sessions). */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* Deterministic PRNG (mulberry32) - same seed, same sky. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Four-point sparkle (✦) path centred at (cx, cy) with radius r. */
export function starPath(cx: number, cy: number, r: number): string {
  const k = r * 0.18;
  return (
    `M ${cx} ${cy - r} Q ${cx + k} ${cy - k} ${cx + r} ${cy} ` +
    `Q ${cx + k} ${cy + k} ${cx} ${cy + r} ` +
    `Q ${cx - k} ${cy + k} ${cx - r} ${cy} ` +
    `Q ${cx - k} ${cy - k} ${cx} ${cy - r} Z`
  );
}

interface ConstellationStar {
  x: number;
  y: number;
  r: number;
  w: number;
}

export function constellationFor(name: string): {
  stars: ConstellationStar[];
  alphaIdx: number;
  pathD: string;
} {
  const rand = mulberry32(hashSeed(name || "lumi"));
  const n = 5 + Math.floor(rand() * 3); // 5–7 stars
  const stars: ConstellationStar[] = [];
  let guard = 0;
  while (stars.length < n && guard++ < 240) {
    const x = 13 + rand() * 74;
    const y = 13 + rand() * 74;
    if (stars.every((p) => Math.hypot(p.x - x, p.y - y) > 17)) {
      stars.push({ x, y, r: 1.7 + rand() * 1.5, w: rand() });
    }
  }
  const cx = stars.reduce((s, p) => s + p.x, 0) / stars.length;
  const cy = stars.reduce((s, p) => s + p.y, 0) / stars.length;
  const ordered = [...stars].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
  const pathD = ordered
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  let alphaIdx = 0;
  stars.forEach((p, i) => {
    if (p.w > stars[alphaIdx]!.w) alphaIdx = i;
  });
  return { stars, alphaIdx, pathD };
}

interface ConstellationProps {
  /** Seed string - usually the class name. Same name ⇒ same constellation. */
  name: string;
  size?: number;
  className?: string;
  /** Twinkle the stars (CSS animation, cheap). */
  twinkle?: boolean;
  /** Line + minor-star colour comes from `currentColor`; alpha star is gold. */
  goldAlpha?: boolean;
}

/** A class's own star-sign: dotted connectors + sparkle stars, one gold alpha. */
export function Constellation({
  name,
  size = 72,
  className = "",
  twinkle = true,
  goldAlpha = true,
}: ConstellationProps) {
  const { stars, alphaIdx, pathD } = useMemo(
    () => constellationFor(name),
    [name]
  );
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <path
        d={pathD}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeDasharray="0.5 4"
        strokeLinecap="round"
        opacity="0.55"
      />
      {stars.map((p, i) => (
        <path
          key={i}
          d={starPath(p.x, p.y, i === alphaIdx ? p.r * 2.3 : p.r * 1.35)}
          fill={
            i === alphaIdx && goldAlpha ? "var(--color-gold)" : "currentColor"
          }
          opacity={i === alphaIdx ? 1 : 0.8}
          className={twinkle ? "animate-twinkle" : undefined}
          style={
            twinkle
              ? {
                  animationDelay: `${((i * 7) % 9) * 0.35}s`,
                  animationDuration: `${2.8 + ((i * 5) % 7) * 0.4}s`,
                  transformBox: "fill-box",
                  transformOrigin: "center",
                }
              : undefined
          }
        />
      ))}
    </svg>
  );
}

interface LumiStarProps {
  size?: number;
  className?: string;
  /** Show the slow-rotating dashed orbit ring. */
  orbit?: boolean;
  /** Breathe gently (scale pulse on the rays). */
  breathe?: boolean;
  rays?: string;
  core?: string;
}

/** The brand mark: an 8-point gold star - 4 long rays + 4 short, ink core. */
export function LumiStar({
  size = 56,
  className = "",
  orbit = false,
  breathe = false,
  rays = "var(--color-gold)",
  core = "var(--color-ink)",
}: LumiStarProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {orbit && (
        <g className="animate-orbit" style={{ transformOrigin: "50px 50px" }}>
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.7"
            strokeDasharray="0.5 5.5"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path d={starPath(96, 50, 2.6)} fill="currentColor" opacity="0.9" />
        </g>
      )}
      <g
        className={breathe ? "animate-breathe" : undefined}
        style={breathe ? { transformOrigin: "50px 50px" } : undefined}
      >
        <path
          d={starPath(50, 50, 26)}
          transform="rotate(45 50 50)"
          fill={rays}
          opacity="0.75"
        />
        <path d={starPath(50, 50, 38)} fill={rays} />
        <circle cx="50" cy="50" r="6.5" fill={core} />
        <circle cx="50" cy="50" r="2.2" fill="var(--color-starlight)" />
      </g>
    </svg>
  );
}

interface StarfieldProps {
  count?: number;
  seed?: number;
  className?: string;
  /** Fraction of stars rendered gold (default ~1 in 7). */
  goldRatio?: number;
}

/** Twinkling micro-stars for night plates. Absolutely fills its parent
 *  (parent must be `relative` + `overflow-hidden`). Deterministic per seed. */
export function Starfield({
  count = 44,
  seed = 7,
  className = "",
  goldRatio = 0.15,
}: StarfieldProps) {
  const stars = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: count }, () => ({
      left: rand() * 100,
      top: rand() * 100,
      s: 1 + rand() * 1.9,
      delay: rand() * 4.5,
      dur: 2.6 + rand() * 3.4,
      gold: rand() < goldRatio,
    }));
  }, [count, seed, goldRatio]);
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {stars.map((st, i) => (
        <span
          key={i}
          className="absolute rounded-full animate-twinkle"
          style={{
            left: `${st.left}%`,
            top: `${st.top}%`,
            width: `${st.s}px`,
            height: `${st.s}px`,
            background: st.gold
              ? "var(--color-gold)"
              : "var(--color-starlight)",
            animationDelay: `${st.delay}s`,
            animationDuration: `${st.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

interface CornerTicksProps {
  className?: string;
  /** Distance from the plate edge, px. */
  inset?: number;
  /** Tick arm length, px. */
  length?: number;
}

/** Chart-plate registration marks - four corner L-ticks. Colour via parent
 *  `text-*` (uses currentColor). Parent must be `relative`. */
export function CornerTicks({
  className = "text-ink/35",
  inset = 9,
  length = 8,
}: CornerTicksProps) {
  const arm = `${length}px`;
  const off = `${inset}px`;
  const base = "absolute border-solid border-current";
  return (
    <div
      className={`pointer-events-none absolute inset-0 ${className}`}
      aria-hidden="true"
    >
      <span
        className={`${base} border-0 border-l border-t`}
        style={{ left: off, top: off, width: arm, height: arm }}
      />
      <span
        className={`${base} border-0 border-r border-t`}
        style={{ right: off, top: off, width: arm, height: arm }}
      />
      <span
        className={`${base} border-0 border-l border-b`}
        style={{ left: off, bottom: off, width: arm, height: arm }}
      />
      <span
        className={`${base} border-0 border-r border-b`}
        style={{ right: off, bottom: off, width: arm, height: arm }}
      />
    </div>
  );
}

/* ── Button class builder ──────────────────────────────────────────────
   MOTION DOCTRINE: these strings animate COLOR/BORDER/SHADOW only (CSS).
   Transform motion (hover lift, tap press) comes from framer via the
   controls kit (`@shared/components/controls` + `@shared/motion`) - never
   re-add `transition-all` or `hover:-translate-*` here; the two systems
   fighting over `transform` is exactly the conflict the doctrine bans. */
const BTN_CORE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-solid transition-[color,background-color,border-color,box-shadow] duration-200 disabled:cursor-default disabled:opacity-50";

const BTN_COLORS = {
  primary: "border-ink bg-ink font-semibold text-cream hover:bg-night",
  gold: "border-gold-deep/50 bg-gold font-bold text-ink hover:bg-[#d4a83e]",
  ghost:
    "border-ink/25 bg-transparent font-semibold text-ink hover:border-ink hover:bg-vellum",
  danger:
    "border-vermilion/35 bg-transparent font-semibold text-vermilion hover:border-vermilion hover:bg-vermilion hover:text-white",
} as const;

const BTN_SIZES = {
  md: "px-7 py-3 text-[15px]",
  sm: "px-5 py-2.5 text-[13.5px]",
} as const;

export type ButtonVariant = keyof typeof BTN_COLORS;
export type ButtonSize = keyof typeof BTN_SIZES;

/** Compose a button class. Sizes are pre-built variants - never stack a
 *  second padding utility on top (conflicting utilities don't resolve by
 *  class order). */
export function btnClass(
  variant: ButtonVariant,
  size: ButtonSize = "md"
): string {
  return `${BTN_CORE} ${BTN_COLORS[variant]} ${BTN_SIZES[size]}`;
}

/**
 * Shared class vocabulary. Compose with extra utilities as needed -
 * conflicting utilities can't be resolved by order (build variants instead).
 */
export const UI = {
  /* Mono instrument labels - uppercase, tracked out. */
  overline:
    "font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold-deep",
  overlineMuted:
    "font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted",
  overlineNight:
    "font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-gold",

  /* Chart plates (cards). */
  plate:
    "relative rounded-xl border border-solid border-line bg-vellum shadow-plate",
  /* Hover affordance for clickable plates - border/shadow only. The physical
     lift comes from framer: make the plate a motion element and spread
     `plateLift` from @shared/motion. */
  plateHover:
    "transition-[border-color,box-shadow] duration-300 hover:border-ink/30 hover:shadow-float",
  nightPlate:
    "relative overflow-hidden rounded-xl border border-solid border-line-night bg-night text-starlight shadow-night",

  /* Buttons (md size). For other sizes use btnClass(variant, size); for the
     full press/lift feel use <Button> from @shared/components/controls. */
  btnPrimary: btnClass("primary"),
  btnGold: btnClass("gold"),
  btnGhost: btnClass("ghost"),
  btnDanger: btnClass("danger"),

  /* Form fields. */
  input:
    "w-full rounded-lg border border-solid border-ink/20 bg-white/60 px-4 py-3 text-[15px] text-ink transition-colors placeholder:text-muted/60 focus:border-gold-deep focus:outline-none",

  /* Hairline rule. */
  rule: "h-px w-full border-0 bg-line",
} as const;
