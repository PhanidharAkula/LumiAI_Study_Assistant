/**
 * Shared overlay behaviors - every modal/fullscreen takeover uses these so
 * scroll-locking and Escape behave identically (and stack correctly) app-wide.
 */
import { useEffect, useRef, useState } from "react";

/* Reference-counted body scroll lock: nested overlays (dialog over chat over
   dashboard) each take a lock; the body unlocks when the LAST one releases. */
let scrollLocks = 0;
let lockedScrollY = 0;

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    scrollLocks += 1;
    // `overflow: hidden` alone does NOT stop iOS touch-scroll behind a fixed
    // overlay (the page underneath still pans). The iOS-proof lock is to pin the
    // body with `position: fixed; top: -scrollY`, then restore the scroll
    // position when the LAST overlay releases. Ref-counted for nested overlays.
    if (scrollLocks === 1) {
      lockedScrollY = window.scrollY;
      const body = document.body;
      body.style.position = "fixed";
      body.style.top = `-${lockedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
    }
    return () => {
      scrollLocks -= 1;
      if (scrollLocks <= 0) {
        scrollLocks = 0;
        const body = document.body;
        body.style.position = "";
        body.style.top = "";
        body.style.left = "";
        body.style.right = "";
        body.style.width = "";
        body.style.overflow = "";
        window.scrollTo(0, lockedScrollY);
      }
    };
  }, [active]);
}

/* Escape-key stack: only the TOP-MOST open overlay closes on Escape, so a
   confirm dialog above a quiz doesn't take the quiz down with it. */
const escStack: Array<() => void> = [];

function onWindowEscape(e: KeyboardEvent) {
  if (e.key !== "Escape" || escStack.length === 0) return;
  escStack[escStack.length - 1]!();
}

export function useEscapeToClose(active: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const entry = () => closeRef.current();
    escStack.push(entry);
    if (escStack.length === 1) {
      window.addEventListener("keydown", onWindowEscape);
    }
    return () => {
      const i = escStack.indexOf(entry);
      if (i !== -1) escStack.splice(i, 1);
      if (escStack.length === 0) {
        window.removeEventListener("keydown", onWindowEscape);
      }
    };
  }, [active]);
}

/** Live media-query check (e.g. `useMediaQuery("(max-width: 767px)")`). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
