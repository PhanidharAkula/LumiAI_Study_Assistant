import { useTokenBudget } from "@shared/lib/tokenBudget";

/**
 * Compact CIRCULAR gauge for the shared daily token budget: a ring that fills as
 * Lumi is used (0 -> 100) with the percentage in the middle, sized to sit beside
 * the round header keys. Turns red as it nears the daily limit. Renders nothing
 * until the budget loads. `night` flips the palette for dark surfaces.
 */
export function UsageBar({
  className = "",
  variant = "day",
}: {
  className?: string;
  variant?: "day" | "night";
}) {
  const { budget } = useTokenBudget();
  if (!budget || budget.limit <= 0) return null;

  const usedPct = Math.max(
    0,
    Math.min(100, (budget.used / budget.limit) * 100)
  );
  const high = usedPct >= 90; // nearly out of daily budget
  const night = variant === "night";

  // Ring geometry in the 44x44 viewBox: r=20 + 4px stroke spans the full box.
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = (usedPct / 100) * circ;

  const track = night ? "stroke-starlight/20" : "stroke-ink/15";
  const fill = high
    ? "stroke-vermilion"
    : night
      ? "stroke-gold"
      : "stroke-gold-deep";
  const text = high ? "text-vermilion" : night ? "text-starlight/85" : "text-ink";

  return (
    <div
      role="img"
      className={`relative h-11 w-11 shrink-0 ${className}`}
      title={`Daily Lumi usage: ${budget.used.toLocaleString()} of ${budget.limit.toLocaleString()} tokens (${Math.round(
        usedPct
      )}% used)`}
      aria-label={`Daily AI usage: ${Math.round(usedPct)}% used`}
    >
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="4"
          className={track}
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          className={`${fill} [transition:stroke-dasharray_0.4s_ease]`}
        />
      </svg>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono">
        <span
          className={`text-[11px] font-semibold leading-none tabular-nums ${text}`}
        >
          {Math.round(usedPct)}
        </span>
        <span className={`text-[7px] leading-none ${text} opacity-70`}>%</span>
      </span>
    </div>
  );
}
