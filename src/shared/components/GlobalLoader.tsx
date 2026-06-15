/**
 * The app's single, always-mounted loader ("Charting…"). It never unmounts: it
 * toggles instantly (no fade) and pauses its spinner when idle, so the spin
 * resumes - rather than restarting from 0 - each time loading begins, no matter
 * how many auth/route-chunk/page-data phases hand off on a refresh. Driven by
 * the shared loading signal so every phase keeps the one instance up.
 *
 * Paints the same `atlas-sky` as the page and overlays (opaque cream base + the
 * dotted graticule, background-attachment:fixed so the dots line up across the
 * whole viewport). It fully covers what's underneath yet blends seamlessly into
 * the sky on hand-off - no flat-fill flash, no see-through/overlap - and toggles
 * instantly so content appears on a clean slate.
 */
import { useGlobalLoading } from "@shared/lib/loadingSignal";

const GlobalLoader = () => {
  const { loading, label } = useGlobalLoading();
  return (
    <div
      aria-hidden={!loading}
      className={`atlas-sky fixed inset-0 z-2000 flex flex-col items-center justify-center gap-1 ${
        loading ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div
        className={`spinner ${loading ? "" : "[animation-play-state:paused]"}`}
      />
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
        {label}&hellip;
      </p>
    </div>
  );
};

export default GlobalLoader;
