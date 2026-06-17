/**
 * Per-chat context gauge: shows how FULL this conversation's memory is - it FILLS
 * (0 -> 100) as the thread grows and turns red as it nears the limit, where Lumi
 * auto-summarizes the oldest turns (easing it back down). Mirrors the daily
 * <UsageBar> (same fill direction + colors) so the two stacked gauges read
 * consistently. Renders nothing for an empty / zero-limit thread. `night` flips
 * the palette for dark surfaces.
 */
export function ContextBar({
  used,
  limit,
  className = "",
  variant = "day",
  labelClassName = "",
}: {
  used: number;
  limit: number;
  className?: string;
  variant?: "day" | "night";
  /** Extra classes for the label (e.g. a fixed width to align stacked bars). */
  labelClassName?: string;
}) {
  if (!(limit > 0) || used <= 0) return null;

  const usedPct = Math.max(0, Math.min(100, (used / limit) * 100));
  const high = usedPct >= 90; // close to a compaction
  const night = variant === "night";

  const labelCls = night ? "text-starlight/55" : "text-muted";
  const track = night ? "bg-starlight/15" : "bg-ink/12";
  const fill = high ? "bg-vermilion" : night ? "bg-gold" : "bg-gold-deep";

  return (
    <div
      className={`flex shrink-0 items-center gap-2 ${className}`}
      title={`Conversation memory: ${used.toLocaleString()} of ${limit.toLocaleString()} tokens used (${Math.round(
        usedPct
      )}% full). Older turns are summarized automatically as it fills.`}
      aria-label={`Conversation memory: ${Math.round(usedPct)}% full`}
    >
      <span
        className={`font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] ${labelCls} ${labelClassName}`}
      >
        Context
      </span>
      <div className={`h-1.5 w-16 overflow-hidden rounded-full ${track}`}>
        <div
          className={`h-full rounded-full ${fill} [transition:width_0.4s_ease]`}
          style={{ width: `${usedPct}%` }}
        />
      </div>
      <span
        className={`font-mono text-[9.5px] tabular-nums ${
          high ? "text-vermilion" : labelCls
        }`}
      >
        {Math.round(usedPct)}%
      </span>
    </div>
  );
}
