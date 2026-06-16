/**
 * The Luminarium control kit - the canonical interactive controls.
 *
 * Every screen uses these instead of hand-rolling buttons, so the whole app
 * presses, lifts, and glows identically:
 *  · BackButton  - the engraved instrument key with the signature ← retreat.
 *  · IconButton  - round icon-only "instrument keys" (close, send, delete…).
 *  · CloseButton - IconButton with the canonical ✕ baked in.
 *  · Button      - pill CTAs over the atlas vocabulary (primary/gold/ghost/danger).
 *  · Spinner     - the shared loading ring, with overlay + label options.
 *
 * Motion comes from @shared/motion (framer); the class strings supply ONLY
 * color/border/shadow transitions (see the motion doctrine in
 * docs/DESIGN-LANGUAGE.md §7). Callers may override any motion prop -
 * spreads are applied before {...rest}.
 */
import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { btnClass, UI, type ButtonSize, type ButtonVariant } from "./atlas";
import { backNudge, keyPress, pressLift } from "@shared/motion";

/* ── BackButton ─────────────────────────────────────────────────────── */

interface BackButtonProps extends HTMLMotionProps<"button"> {
  /** Accessible name (default "Go back"). */
  label?: string;
  /** Night-surface treatment (active quiz, talk, flashcard backs). */
  night?: boolean;
}

/** The shared back key: vellum disc, hairline ring, gold on hover, and the
 *  signature ← retreat on hover (canonized from Login). Keeps the global
 *  `.back-button` marker class. */
export const BackButton = forwardRef<HTMLButtonElement, BackButtonProps>(
  function BackButton(
    { label = "Go back", night = false, className = "", ...rest },
    ref
  ) {
    return (
      <motion.button
        ref={ref}
        type="button"
        className={`back-button ${night ? "back-button-night" : ""} ${className}`}
        aria-label={label}
        {...backNudge}
        {...rest}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </motion.button>
    );
  }
);

/* ── IconButton ─────────────────────────────────────────────────────── */

const ICON_SIZES = {
  /** Dense contexts: history-row actions, inline list controls. */
  sm: "h-9 w-9",
  /** Row/card action keys (view/edit/delete): compact on desktop, 44px on phones. */
  action: "h-9 w-9 max-md:h-11 max-md:w-11",
  /** Default instrument key: headers, send/attach. */
  md: "h-10 w-10 max-md:h-11 max-md:w-11",
  /** Back-disc-matched key: menu + close (46px desktop, 44px phone). */
  keyLg: "h-11.5 w-11.5 max-md:h-11 max-md:w-11",
  /** Hero controls (flashcard prev/flip/next): 46px desktop, 44px on phones. */
  lg: "h-11.5 w-11.5 max-md:h-11 max-md:w-11",
} as const;

const ICON_VARIANTS = {
  /** Transparent ring - quiet contexts. */
  ghost:
    "border-ink/25 bg-transparent text-ink hover:border-gold-deep hover:bg-gold/10 hover:text-gold-deep",
  /** Vellum disc with plate shadow - like the back button; page headers. */
  key: "border-ink/25 bg-vellum text-ink shadow-plate hover:border-gold-deep hover:text-gold-deep",
  /** Ink-filled - the one emphasized action (send). */
  solid: "border-ink bg-ink text-cream shadow-plate hover:bg-night",
  /** Red-ink - destructive. */
  danger:
    "border-vermilion/35 bg-transparent text-vermilion hover:border-vermilion hover:bg-vermilion hover:text-white",
  /** Hairline on night surfaces. */
  night:
    "border-line-night bg-transparent text-starlight hover:border-gold hover:text-gold",
} as const;

export interface IconButtonProps extends HTMLMotionProps<"button"> {
  /** Accessible name - required: these are icon-only. */
  label: string;
  size?: keyof typeof ICON_SIZES;
  variant?: keyof typeof ICON_VARIANTS;
  children?: ReactNode;
}

/** Round icon-only instrument key. Pass the icon SVG as children (16–20px,
 *  stroke 1.5–1.75, `aria-hidden`). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      size = "md",
      variant = "ghost",
      className = "",
      children,
      ...rest
    },
    ref
  ) {
    return (
      <motion.button
        ref={ref}
        type="button"
        className={`flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-solid p-0 transition-[color,background-color,border-color,box-shadow] duration-200 disabled:cursor-default disabled:opacity-40 ${ICON_SIZES[size]} ${ICON_VARIANTS[variant]} ${className}`}
        aria-label={label}
        {...keyPress}
        {...rest}
      >
        {children}
      </motion.button>
    );
  }
);

/* ── CloseButton ────────────────────────────────────────────────────── */

type CloseButtonProps = Omit<IconButtonProps, "children" | "label"> & {
  label?: string;
  /** Icon glyph size in px (default 18). */
  iconSize?: number;
};

/** The canonical dismiss key - every overlay/panel closes with this. */
export const CloseButton = forwardRef<HTMLButtonElement, CloseButtonProps>(
  function CloseButton(
    { label = "Close", iconSize = 18, size = "keyLg", ...rest },
    ref
  ) {
    return (
      <IconButton ref={ref} label={label} size={size} {...rest}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </IconButton>
    );
  }
);

/* ── Button ─────────────────────────────────────────────────────────── */

export interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

/** Pill CTA with the shared lift/press feel. For link-shaped CTAs use
 *  `motion.a` + `btnClass(...)` + spread `pressLift` from @shared/motion. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", className = "", children, ...rest },
    ref
  ) {
    return (
      <motion.button
        ref={ref}
        type="button"
        className={`${btnClass(variant, size)} ${className}`}
        {...pressLift}
        {...rest}
      >
        {children}
      </motion.button>
    );
  }
);

/* ── Spinner ────────────────────────────────────────────────────────── */

interface SpinnerProps {
  /** sm = inline/in-button (20px); md = the standard 40px ring. */
  size?: "sm" | "md";
  /** Optional mono caption under the ring. */
  label?: string;
  /** Cover the nearest `relative` parent with a translucent veil. */
  overlay?: boolean;
  /** Surface the spinner sits on (tints veil + caption). */
  tone?: "day" | "night";
  className?: string;
}

/** The shared loading ring (global `.spinner` look), normalized: no stray
 *  margins, optional caption, optional parent-covering overlay. */
export function Spinner({
  size = "md",
  label,
  overlay = false,
  tone = "day",
  className = "",
}: SpinnerProps) {
  const ring = (
    <span
      className={`spinner mb-0! ${
        size === "sm" ? "h-5! w-5! max-[480px]:h-5! max-[480px]:w-5!" : ""
      } ${overlay ? "" : className}`}
      role="status"
      aria-label={label || "Loading"}
    />
  );
  if (!overlay) {
    if (!label) return ring;
    return (
      <span className={`flex flex-col items-center gap-3 ${className}`}>
        {ring}
        <span
          className={tone === "night" ? UI.overlineNight : UI.overlineMuted}
        >
          {label}
        </span>
      </span>
    );
  }
  return (
    <div
      className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 ${
        tone === "night" ? "bg-night/85" : "bg-vellum/85"
      } ${className}`}
    >
      {ring}
      {label && (
        <span
          className={tone === "night" ? UI.overlineNight : UI.overlineMuted}
        >
          {label}
        </span>
      )}
    </div>
  );
}
