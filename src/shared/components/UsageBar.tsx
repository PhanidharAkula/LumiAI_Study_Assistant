import { useTokenBudget } from "@shared/lib/tokenBudget";

/**
 * Compact "fuel gauge" for the shared daily token budget: the bar shows how much
 * is LEFT (it depletes as Lumi is used) and turns red when nearly out. Renders
 * nothing until the budget loads. `night` flips the palette for dark surfaces.
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

  const remainingPct = Math.max(
    0,
    Math.min(100, (budget.remaining / budget.limit) * 100)
  );
  const low = remainingPct <= 10;
  const night = variant === "night";

  const labelCls = night ? "text-starlight/55" : "text-muted";
  const track = night ? "bg-starlight/15" : "bg-ink/12";
  const fill = low ? "bg-vermilion" : night ? "bg-gold" : "bg-gold-deep";

  return (
    <div
      className={`flex shrink-0 items-center gap-2 ${className}`}
      title={`Daily Lumi usage: ${budget.used.toLocaleString()} of ${budget.limit.toLocaleString()} tokens (${Math.round(
        remainingPct
      )}% left)`}
      aria-label={`Daily AI usage: ${Math.round(remainingPct)}% remaining`}
    >
      <span
        className={`font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] ${labelCls}`}
      >
        Daily
      </span>
      <div className={`h-1.5 w-16 overflow-hidden rounded-full ${track}`}>
        <div
          className={`h-full rounded-full ${fill} [transition:width_0.4s_ease]`}
          style={{ width: `${remainingPct}%` }}
        />
      </div>
      <span
        className={`font-mono text-[9.5px] tabular-nums ${
          low ? "text-vermilion" : labelCls
        }`}
      >
        {Math.round(remainingPct)}%
      </span>
    </div>
  );
}
