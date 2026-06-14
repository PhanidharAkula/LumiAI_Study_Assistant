import { motion } from "framer-motion";
import { Constellation, CornerTicks, UI } from "@shared/components/atlas";
import { fadeRise, stagger } from "@shared/motion";

// Only the fields the analytics view needs - AdminUser is structurally assignable.
interface AnalyticsUser {
  created_at: string;
  region: string;
}

interface Props {
  users: AnalyticsUser[];
}

const DAY_MS = 86400000;

// Growth + activity overview derived entirely from the loaded user list
// (each user's created_at + region) - no extra queries, no schema changes.
export default function AdminAnalytics({ users }: Props) {
  const nowMs = Date.now();
  const createdMs = (u: AnalyticsUser) => new Date(u.created_at).getTime();
  const newWithin = (days: number) =>
    users.filter((u) => nowMs - createdMs(u) < days * DAY_MS).length;

  const todayStartMs = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  // Daily signups for the last 30 days (oldest → newest).
  const signupDays = Array.from({ length: 30 }, (_, i) => {
    const start = todayStartMs - (29 - i) * DAY_MS;
    const end = start + DAY_MS;
    const count = users.filter((u) => {
      const t = createdMs(u);
      return t >= start && t < end;
    }).length;
    return { start, count };
  });
  const maxSignups = Math.max(1, ...signupDays.map((d) => d.count));

  // The hero readout (Total observers) gets CornerTicks; the rest are plain
  // instrument plates. `hero` keys the one ticked stat in the strip.
  const kpis = [
    {
      label: "Today",
      value: users.filter((u) => createdMs(u) >= todayStartMs).length,
    },
    { label: "Last 7 days", value: newWithin(7) },
    { label: "Last 30 days", value: newWithin(30) },
    { label: "Total observers", value: users.length, hero: true },
  ];

  const regionRows = Object.entries(
    users.reduce<Record<string, number>>((acc, u) => {
      const r = u.region || "Unknown";
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const maxRegion = Math.max(1, ...regionRows.map(([, c]) => c));

  const fmtDay = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center">
        <Constellation name="observatory" size={110} className="text-ink/30" />
        <span className={UI.overlineMuted}>A clear, empty sky</span>
        <p className="m-0 font-display text-[16px] text-muted">No users yet.</p>
      </div>
    );
  }

  return (
    <motion.div
      className="flex flex-col gap-4"
      variants={stagger()}
      initial="hidden"
      animate="visible"
    >
      {/* KPI strip - instrument readouts. Hero (Total observers) is ticked.
          Collapses to a single column below 480px per the responsive rule. */}
      <div className="grid grid-cols-4 gap-2.5 max-md:grid-cols-2 max-[480px]:grid-cols-1">
        {kpis.map((k) => (
          <motion.div
            key={k.label}
            variants={fadeRise}
            className={`${UI.plate} flex flex-col items-start gap-1.5 overflow-hidden p-4 max-md:p-3.5`}
          >
            {k.hero && <CornerTicks />}
            <span className={UI.overlineMuted}>{k.label}</span>
            <span className="font-display text-[34px] font-semibold leading-none text-ink max-md:text-[28px]">
              {k.value}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Signups over time - engraved column chart */}
      <motion.div
        variants={fadeRise}
        className={`${UI.plate} p-5.5 max-md:p-4`}
      >
        <h3 className={`m-0 mb-4 ${UI.overline}`}>
          New signups · last 30 days
        </h3>
        <div className="flex items-end gap-0.5 h-30">
          {signupDays.map((d, i) => (
            <div
              key={d.start}
              title={`${fmtDay(d.start)}: ${d.count} signup${
                d.count === 1 ? "" : "s"
              }`}
              className={`flex-1 rounded-t-xs ${
                i === signupDays.length - 1
                  ? "bg-gold border-0 border-t border-solid border-gold-deep/70"
                  : d.count > 0
                    ? "bg-ink/25 border-0 border-t border-solid border-ink/60"
                    : "bg-ink/7"
              }`}
              style={{
                height: `${Math.max(4, (d.count / maxSignups) * 100)}%`,
              }}
            />
          ))}
        </div>
        {/* Baseline hairline */}
        <div className={UI.rule} />
        <div className="flex justify-between mt-2">
          <span className={UI.overlineMuted}>
            {fmtDay(signupDays[0].start)}
          </span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-gold-deep">
            ✦ Today
          </span>
        </div>
      </motion.div>

      {/* Users by region - hairline distribution bars */}
      <motion.div
        variants={fadeRise}
        className={`${UI.plate} p-5.5 max-md:p-4`}
      >
        <h3 className={`m-0 mb-4 ${UI.overline}`}>Users by region</h3>
        <div className="flex flex-col gap-2.5">
          {regionRows.map(([region, count]) => (
            <div key={region} className="flex items-center gap-3">
              <span className="w-22.5 shrink-0 text-[13px] text-ink overflow-hidden text-ellipsis whitespace-nowrap">
                {region}
              </span>
              <div className="flex-1 h-2.5 rounded-full border border-solid border-line bg-cream/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-verdi"
                  style={{ width: `${(count / maxRegion) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-[12px] font-medium text-ink">
                {count}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
