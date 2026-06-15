/**
 * A tiny global "is anything loading" signal, so a single persistent loader can
 * span the whole startup sequence (auth -> route chunk -> page data) without
 * ever unmounting. Each phase calls useLoadingSignal(true) while it's busy; the
 * GlobalLoader reads the combined state. Because the loader element never
 * remounts, its spinner pauses/resumes instead of restarting from 0.
 */
import { useEffect, useSyncExternalStore } from "react";

let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const begin = () => {
  count += 1;
  emit();
};
const end = () => {
  count = Math.max(0, count - 1);
  emit();
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const getSnapshot = () => count > 0;

/**
 * Contribute to the global loading state while `active` is true (begins on true,
 * ends on false or unmount). Reference-counted, so overlapping phases keep the
 * loader up until the last one finishes.
 */
export function useLoadingSignal(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    begin();
    return end;
  }, [active]);
}

/** Whether anything is currently loading. */
export function useGlobalLoading(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * A Suspense fallback (or standalone marker) that feeds the global loader while
 * mounted instead of rendering its own spinner - so the one persistent loader
 * covers lazy chunk loads too (route chunks, the Quiz/Flashcards overlays).
 * Renders nothing itself.
 */
export function LoadingSignal(): null {
  useLoadingSignal(true);
  return null;
}
