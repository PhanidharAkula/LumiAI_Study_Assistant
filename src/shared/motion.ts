/**
 * The Luminarium motion vocabulary - the single source of UI motion.
 *
 * Doctrine (binding - docs/DESIGN-LANGUAGE.md §7):
 *  · framer-motion owns every UI state change on transform/opacity:
 *    entrances, exits, hover lifts, tap presses, overlay transitions.
 *  · CSS transitions are allowed ONLY for color/border/shadow
 *    (`transition-colors`, `transition-[…,box-shadow]`) - never
 *    `transition-all`, never transform. Two systems writing `transform`
 *    is how hover-lifts silently die after a framer animation runs.
 *  · CSS keyframes are reserved for ambient celestial texture - twinkle,
 *    orbit, breathe, shimmer, spinner - looping decoration, never UI state.
 *
 * Pull springs/variants from here instead of inventing per-screen constants
 * so the whole app shares one physical feel.
 */
import type { Transition, Variants } from "framer-motion";

/* ── Springs - the app's three physical materials ──────────────────── */
export const spring = {
  /** Instrument keys (icon buttons) - crisp, immediate. */
  press: { type: "spring", stiffness: 400, damping: 17 } as Transition,
  /** CTAs and plates lifting on hover - calm, viscous. */
  lift: { type: "spring", stiffness: 320, damping: 22 } as Transition,
  /** Entrances - soft settle (the Login plate's feel). */
  gentle: { type: "spring", stiffness: 110, damping: 16 } as Transition,
  /** Modal plates popping in. */
  plate: { type: "spring", stiffness: 320, damping: 26 } as Transition,
} as const;

/** The engraved-rise ease (same curve as the old CSS `rise` keyframe). */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Durations (s) for non-spring fades. */
export const DUR = { fast: 0.15, base: 0.22, slow: 0.4 } as const;

/* ── Entrance variants (use with a `stagger()` parent) ─────────────── */
/** Plate/card entrance - rises out of the page. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: spring.gentle },
};

/** Subtler rise for dense rows/list items. */
export const fadeRiseSoft: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: spring.gentle },
};

/** Parent orchestrator for staggered children using fadeRise*. */
export const stagger = (
  delayChildren = 0.12,
  staggerChildren = 0.08
): Variants => ({
  hidden: {},
  visible: { transition: { delayChildren, staggerChildren } },
});

/* ── Overlay / modal variants (hidden → visible → exit) ────────────── */
export const scrimFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

/** Centered dialog plate. */
export const modalPop: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.plate },
  exit: { opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.18 } },
};

/** Bottom-sheet plate (phone-width overlays). */
export const sheetUp: Variants = {
  hidden: { opacity: 0, y: 56 },
  visible: { opacity: 1, y: 0, transition: spring.plate },
  exit: { opacity: 0, y: 48, transition: { duration: 0.2 } },
};

/* ── Interaction props - spread onto motion elements ───────────────── */
/** CTA buttons: gentle lift, settle on press. */
export const pressLift = {
  whileHover: { y: -2, transition: spring.lift },
  whileTap: { scale: 0.98 },
} as const;

/** Icon "instrument keys": scale pop. */
export const keyPress = {
  whileHover: { scale: 1.06, transition: spring.press },
  whileTap: { scale: 0.92 },
} as const;

/** Clickable plates/cards: physical lift (CSS supplies border/shadow shift). */
export const plateLift = {
  whileHover: { y: -4, transition: spring.lift },
  whileTap: { scale: 0.99 },
} as const;

/** The back button's signature retreat (canonical, from Login). */
export const backNudge = {
  whileHover: {
    x: -4,
    transition: { type: "spring", stiffness: 300, damping: 12 } as Transition,
  },
  whileTap: { scale: 0.97 },
} as const;
