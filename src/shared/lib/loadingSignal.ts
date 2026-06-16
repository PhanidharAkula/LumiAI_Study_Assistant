/**
 * A tiny global "is anything loading" signal, so a single persistent loader can
 * span the whole startup sequence (auth -> route chunk -> page data) without
 * ever unmounting. Each phase calls useLoadingSignal(true, label) while it's
 * busy; the GlobalLoader reads the combined state and shows the most recently
 * begun phase's label, so the message tracks the screen/component you're waiting
 * on. Because the loader element never remounts, its spinner pauses/resumes
 * instead of restarting from 0.
 */
import { useEffect, useSyncExternalStore } from "react";

const DEFAULT_LABEL = "Charting";

type Entry = { id: number; label: string };
let entries: Entry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

// Cached snapshot: useSyncExternalStore needs a stable reference between changes,
// so we only build a new object when loading/label actually changes.
let snapshot: { loading: boolean; label: string } = {
  loading: false,
  label: DEFAULT_LABEL,
};

const recompute = () => {
  const loading = entries.length > 0;
  // Most recently begun phase = the current (deepest) context to name.
  const label = loading ? entries[entries.length - 1]!.label : DEFAULT_LABEL;
  if (loading !== snapshot.loading || label !== snapshot.label) {
    snapshot = { loading, label };
  }
};

const emit = () => {
  recompute();
  listeners.forEach((l) => l());
};

const begin = (label: string): number => {
  const id = nextId++;
  entries.push({ id, label });
  emit();
  return id;
};
const end = (id: number) => {
  entries = entries.filter((e) => e.id !== id);
  emit();
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const getSnapshot = () => snapshot;

/**
 * Contribute to the global loading state while `active` is true (begins on true,
 * ends on false or unmount). Reference-counted, so overlapping phases keep the
 * loader up until the last one finishes. `label` names the phase in the loader.
 */
export function useLoadingSignal(
  active: boolean,
  label: string = DEFAULT_LABEL
): void {
  useEffect(() => {
    if (!active) return;
    const id = begin(label);
    return () => end(id);
  }, [active, label]);
}

/** Whether anything is loading, plus the current phase's label. */
export function useGlobalLoading(): { loading: boolean; label: string } {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * A Suspense fallback (or standalone marker) that feeds the global loader while
 * mounted instead of rendering its own spinner - so the one persistent loader
 * covers lazy chunk loads too (route chunks, the Quiz/Flashcards overlays).
 * Renders nothing itself. Pass `label` to name the phase.
 */
export function LoadingSignal({ label }: { label?: string }): null {
  useLoadingSignal(true, label);
  return null;
}
