# THE LUMINARIUM — LumiAI design language

> **Concept:** *A celestial atlas for your mind.* Lumi means light. The app is
> an astronomer's study atelier: warm parchment pages, midnight-ink plates,
> gold-leaf stars, engraved hairlines, chart plates with registration ticks,
> and mono "instrument" labels. Every class has its own constellation,
> procedurally generated from its name. Studying = charting your sky.

This document is the binding spec for restyling any LumiAI screen.

## 1. Non-negotiable engineering rules

1. **Zero logic changes.** Keep every prop, handler, state machine, service
   call, URL-param behavior, and effect exactly as-is. This is a restyle.
2. **Keep marker classes** code depends on (alongside new utilities):
   `.back-button`, `.history-button`, `.quiz-content-area`,
   `.accdel-dialog-overlay` (+ `accdel-*` body classes), `.spinner`, `.link`.
3. **Tailwind v4, preflight OFF** — gotchas:
   - Borders need `border-solid` and an explicit width: `border border-solid border-line`.
   - Single-side borders need `border-0` first: `border-0 border-b border-solid border-line`.
   - Use arbitrary font sizes (`text-[15px]`) — scale classes bundle line-heights.
   - Overriding inline `style={{}}` or unlayered globals needs `!` (e.g. `mb-0!`).
   - Conflicting utilities can't be fixed by class order — build variant strings.
4. **Responsive parity:** the codebase is desktop-first. Keep every existing
   `max-md:` / `max-[480px]:` / `max-[900px]:` etc. breakpoint COVERED — you may
   restyle what happens at each breakpoint, but never drop a breakpoint's
   handling (mobile layouts must still adapt where they adapted before).
5. **Keep framer-motion structure** (motion components, AnimatePresence
   placement, layout props). You may re-tune transitions/variants tastefully.
6. After editing: `npx tsc --noEmit` must stay clean for your files.

## 2. Tokens (defined in `src/app/index.css` `@theme`)

| Token | Value | Use |
|---|---|---|
| `cream` | `#f3edde` | parchment page bg (legacy name) |
| `vellum` | `#fbf7ec` | raised plate/card surface |
| `night` | `#171326` | midnight plates (focus moments) |
| `night-2` | `#241e38` | raised surface on night |
| `ink` | `#1d1b16` | primary text/borders (legacy name) |
| `muted` | `#6f6757` | secondary text (legacy name) |
| `starlight` | `#f5eedb` | text on night |
| `line` | `rgb(29 27 22 / .14)` | hairline borders on parchment |
| `line-night` | `rgb(245 238 219 / .16)` | hairlines on night |
| `sage` | `#9ac2b9` | verdigris accent surface (legacy name) |
| `verdi` | `#3f6e66` | deep verdigris, text-safe |
| `gold` | `#c79a33` | gold leaf, decorative |
| `gold-deep` | `#8a6516` | gold, text-safe on parchment |
| `vermilion` | `#b23a1d` | red-ink errors/danger |
| `vermilion-wash` | `#f7e4da` | red wash bg |

Shadows: `shadow-plate` (resting), `shadow-float` (hover/raised),
`shadow-night` (night plates). **Never** `shadow-[0px_2px_0_#000]` hard offsets.

Fonts: `font-display` = Fraunces (serif, headings/numbers — *italic* for accent
words), default body = Schibsted Grotesk (no class needed), `font-mono` =
Spline Sans Mono (overline labels).

Animations: `animate-twinkle`, `animate-orbit`, `animate-orbit-slow`,
`animate-rise`, `animate-breathe`, `animate-shimmer` (+ existing `animate-blink`,
`animate-thinking-fade`, `animate-typing-bounce`, `progress` keyframes).

## 3. Shared kit

```tsx
import { Constellation, LumiStar, Starfield, CornerTicks, UI, btnClass, hashSeed, starPath } from "@shared/components/atlas";
import { BackButton, IconButton, CloseButton, Button, Spinner } from "@shared/components/controls";
import Modal from "@shared/components/Modal";
import { spring, fadeRise, fadeRiseSoft, stagger, scrimFade, modalPop, sheetUp, pressLift, keyPress, plateLift, backNudge, EASE_OUT, DUR } from "@shared/motion";
import { useScrollLock, useEscapeToClose, useMediaQuery } from "@shared/hooks/overlay";
```

- `<Constellation name={className} size={72} className="text-ink/70" />` — a
  class's star-sign. Same name ⇒ same constellation everywhere. Colour via
  `text-*`; alpha star is gold.
- `<LumiStar size={56} orbit breathe />` — brand star (gold rays, ink core);
  the orbit ring colour follows `currentColor`. Works on parchment and night.
- `<Starfield count={44} seed={7} />` — twinkling micro-stars; parent needs
  `relative overflow-hidden` (use inside `bg-night` plates).
- `<CornerTicks />` — plate registration marks; parent needs `relative`.
- `UI.*` class strings: `overline`, `overlineMuted`, `overlineNight`, `plate`,
  `plateHover`, `nightPlate`, `btnPrimary`, `btnGold`, `btnGhost`, `btnDanger`,
  `input`, `rule`.

## 4. The look, concretely

- **Page scaffold:** generous top padding; a mono overline label
  (`UI.overline`) naming the screen like an atlas plate — e.g.
  `PLATE 04 · QUIZZES` or `FIG. 2 — YOUR SKY` — above a Fraunces
  `font-display` heading (`text-[34-44px] font-semibold`, occasionally an
  italic word). Optional hairline rule under the header:
  `<div className={UI.rule} />`.
- **Cards = chart plates:** `UI.plate` (+ `UI.plateHover` when clickable) +
  `<CornerTicks />` on hero/feature plates (don't tick every tiny card).
  Padding 20–28px. Radius stays `rounded-xl` (12px) or `rounded-lg` — never
  bubbly 24px+.
- **Buttons:** pills. Primary = ink fill (`UI.btnPrimary`); the ONE hero CTA
  per screen may be gold (`UI.btnGold`). Secondary = `UI.btnGhost`. Danger =
  `UI.btnDanger`. Decorate key CTAs with a small ✦ (text glyph or
  `starPath` SVG) that's `opacity-0 group-hover:opacity-100` etc.
- **Stat numbers / scores:** Fraunces — `font-display text-[28-40px] font-semibold`.
- **Labels over values:** `UI.overlineMuted` above, value below — instrument
  readout style.
- **Night plates** (`UI.nightPlate` + `<Starfield />`): active quiz question,
  talk screen, flashcard backs, results hero. Text `text-starlight`,
  secondary `text-starlight/60`, hairlines `border-line-night`, accent gold.
- **Selected states:** ink-filled or `bg-sage/40 border-verdi` with a small
  gold ✦ — never plain blue.
- **Empty states:** a faint `Constellation` + mono overline + a short serif
  line. Charming, not cartoonish.
- **Errors:** `bg-vermilion-wash border border-solid border-vermilion/30
  text-vermilion rounded-lg` — like red-ink margin notes.
- **Motion:** see §7 — framer-motion only for UI motion; entrances use
  `fadeRise` + `stagger()` from `@shared/motion`. One signature moment per
  screen max.
- **Backgrounds:** the body already paints the parchment sky (grain + dot
  graticule + gold dawn). Screens DON'T paint their own page background —
  remove old `bg-cream` page-level fills so the sky shows; plates sit on it.
  Full-screen overlays (chat/quiz/etc.) that previously used `bg-cream` as
  their own backdrop should use `bg-cream/95 backdrop-blur-[2px]` or the
  night treatment, per their spec.

## 5. Copy voice (only where text is already presentational)

Observatory register, used sparingly: "Chart a new class", "Your sky so far",
"PLATE 04", "EXPEDITION · 10 QUESTIONS". Don't rewrite functional copy,
errors, or anything the user must parse to operate the app. When in doubt,
keep existing copy.

## 6. What to remove on sight (old language)

- `shadow-[0px_2px_0_#000]` / `shadow-[0px_3px_0_#000]` hard offsets → soft shadows.
- `border-2 border-solid border-ink` thick outlines → hairline `border-line`
  (interactive elements may use `border-ink/25`→`hover:border-ink`).
- `rounded-3xl`/`rounded-[20px]+` bubbles → `rounded-xl` max (pills stay `rounded-full`).
- `bg-white` cards → `bg-vellum` (true white only inside inputs/code).
- Winky Sans references, `font-extrabold` display text → `font-display` Fraunces.
- Emoji used as icons → inline SVG (16/20px, stroke 1.5–1.75) or ✦ glyphs.
- `transition-all` anywhere → `transition-colors` or
  `transition-[color,background-color,border-color,box-shadow]` (§7).
- CSS `hover:-translate-*` / `hover:scale-*` / `active:translate-*` →
  framer `pressLift`/`keyPress`/`plateLift` on a motion element.
- `animate-rise` on UI elements → `fadeRise` variants (+ `stagger()` parent).
- Hand-rolled back/close/icon/CTA buttons → the controls kit (§8).

## 7. Motion doctrine (binding)

**framer-motion is the single system for UI motion.** CSS may not animate
`transform` or run entrance/exit animations on UI elements.

| Concern | System | How |
|---|---|---|
| Entrances/exits | framer | `fadeRise`/`fadeRiseSoft` children under a `stagger()` parent; overlays use `scrimFade` + `modalPop`/`sheetUp` |
| Hover/tap transforms | framer | spread `pressLift` (CTAs), `keyPress` (icon keys), `plateLift` (clickable plates) |
| Color/border/shadow hovers | CSS | `transition-colors` / `transition-[color,background-color,border-color,box-shadow]` — **never `transition-all`** |
| Ambient celestial texture | CSS keyframes | `animate-twinkle/orbit/breathe/shimmer`, `.spinner`, typing dots — looping decoration only, never tied to interaction |

Rules:
1. One element must never have both a framer transform (`whileHover`,
   `initial/animate`, `variants`) and a CSS class that transitions/animates
   `transform` (`transition-all`, `hover:-translate-*`, `animate-rise`).
   framer writes inline `transform`, which permanently overrides the CSS one.
2. All springs/durations come from `@shared/motion` (`spring.press`, `.lift`,
   `.gentle`, `.plate`; `DUR`; `EASE_OUT`). Don't invent per-screen constants.
3. Staggers: parent `variants={stagger()}` + `initial="hidden"`
   `animate="visible"`, children `variants={fadeRise}`. Lists with many rows
   use `fadeRiseSoft` and at most ~12 staggered rows (rest appear instantly).
4. Reduced motion is handled globally — `<MotionConfig reducedMotion="user">`
   in App.tsx + the unlayered media block in index.css. Don't add per-screen
   handling.
5. `AnimatePresence` owns overlay exits; never pair it with CSS animations on
   the same node.

## 8. Control canon (binding)

All interactive controls come from `@shared/components/controls`:

- `<BackButton onClick={…} label="Back to dashboard" night?>` — the only back
  affordance. Position via `className`. Signature ← retreat on hover.
- `<CloseButton onClick={…}>` — the only dismiss affordance (overlays, modals,
  panels). `size="sm"` in dense rows.
- `<IconButton label size="sm|md|lg" variant="ghost|key|solid|danger|night">`
  — every icon-only control (send, history, delete, arrows…). Icon children:
  16–20px SVG, stroke 1.5–1.75, `aria-hidden`.
- `<Button variant="primary|gold|ghost|danger" size="md|sm">` — every pill CTA.
  Link-shaped CTAs: `motion.a` + `btnClass(variant, size)` + spread `pressLift`.
- `<Spinner size label overlay tone>` — every loading state; never hand-roll
  rings. Generation/AI waits get `label` so the wait reads as deliberate.
- `<Modal open onClose size overline title sheetOnMobile>` — every floating
  dialog plate (forms, pickers, errors). Fullscreen experiences (chat, quiz,
  flashcards, talk, file viewer) keep their own shells but must use
  `useScrollLock` + `useEscapeToClose` and kit controls inside.
- `ConfirmDialog` stays the confirm/alert primitive (it follows the canon
  internally).

Hard rules: no hand-rolled `<button>` styling; no raw `motion.button` with
ad-hoc spring constants; every icon-only button has `aria-label`; paired
dialog actions are same-size kit Buttons.
