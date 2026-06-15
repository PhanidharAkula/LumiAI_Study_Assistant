import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { Session } from "@supabase/supabase-js";
import {
  createTicket,
  getMyTickets,
  type SupportTicket,
} from "@shared/services/supportService";
import { Constellation, CornerTicks, UI } from "@shared/components/atlas";
import { BackButton, Button } from "@shared/components/controls";
import { useLoadingSignal } from "@shared/lib/loadingSignal";
import Select from "@shared/components/Select";
import { fadeRise, fadeRiseSoft, stagger } from "@shared/motion";

const CATEGORIES = [
  { value: "general", label: "General question" },
  { value: "account", label: "Account & login" },
  { value: "bug", label: "Something's broken" },
  { value: "feature", label: "Feature request" },
  { value: "other", label: "Other" },
];

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

const CATEGORY_LABEL = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.value] = c.label;
    return acc;
  },
  {} as Record<string, string>
);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

// Status chips for the ledger - the app's shared chip recipe (hairline border
// + wash + text-safe ink, like the New/category chips on review cards).
// Unknown statuses fall back to the raw string in the "open" style.
const STATUS_CHIP: Record<string, string> = {
  open: "border-gold-deep/40 bg-gold/15 text-gold-deep",
  in_progress: "border-verdi/30 bg-sage/25 text-verdi",
  resolved: "border-verdi/40 bg-sage/40 text-verdi",
};

const StatusSeal = ({ status }: { status: string }) => {
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span
      className={`inline-flex shrink-0 cursor-default items-center gap-1 whitespace-nowrap rounded-full border border-solid px-2.5 py-0.75 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] ${
        STATUS_CHIP[status] ?? STATUS_CHIP.open
      }`}
    >
      {status === "resolved" && (
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {label}
    </span>
  );
};

const Support = ({ session }: { session: Session | null }) => {
  const navigate = useNavigate();
  const email = session?.user?.email;

  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await getMyTickets();
      if (active) {
        setTickets(data);
        setLoadingTickets(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!subject.trim() || !message.trim()) {
      setError("Please add a subject and a message.");
      return;
    }

    setSubmitting(true);
    const { data, error: submitError } = await createTicket({
      category,
      subject,
      message,
    });
    setSubmitting(false);

    if (submitError || !data) {
      setError(
        submitError || "Couldn't submit your request. Please try again."
      );
      return;
    }

    setTickets((prev) => [data, ...prev]);
    setSubject("");
    setMessage("");
    setCategory("general");
    setSuccess("Thanks! We got your message and will reply by email.");
  };

  // Cover the page with the shared centered loader while requests load, instead
  // of a spinner low in the page.
  useLoadingSignal(loadingTickets, "Opening the desk");

  if (loadingTickets) return null;

  return (
    <div className="relative min-h-dvh w-full px-5 pt-21 pb-15 max-[600px]:px-3.5 max-[600px]:pt-18 max-[600px]:pb-10">
      {/* Faint sky behind the desk. */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <Constellation
          name="correspondence desk"
          size={440}
          twinkle
          className="absolute -right-28 -top-16 text-ink/10"
        />
      </div>

      <BackButton
        className="absolute left-6 top-6 z-2 max-[600px]:left-4 max-[600px]:top-4"
        onClick={() => navigate("/dashboard")}
        label="Back to dashboard"
      />

      <motion.div
        className="relative z-1 mx-auto max-w-160"
        variants={stagger()}
        initial="hidden"
        animate="visible"
      >
        <motion.p
          className={`${UI.overline} cursor-default text-center`}
          variants={fadeRise}
        >
          Correspondence
        </motion.p>
        <motion.h1
          className="mb-2 mt-3 cursor-default text-center font-display text-[36px] font-semibold leading-[1.12] tracking-[-0.01em] max-[600px]:text-[28px]"
          variants={fadeRise}
        >
          Help &amp;{" "}
          <em className="[font-variation-settings:'SOFT'_60,'WONK'_1]">
            Support
          </em>
        </motion.h1>
        <motion.p
          className="mx-auto mb-6 max-w-120 cursor-default text-center text-[15px] leading-[1.65] text-muted [&_strong]:font-semibold [&_strong]:text-ink"
          variants={fadeRise}
        >
          Have a question or run into a snag? Send us a message
          {email ? (
            <>
              {" "}
              and we&apos;ll reply to <strong>{email}</strong>.
            </>
          ) : (
            <> and we&apos;ll get back to you by email.</>
          )}
        </motion.p>
        <motion.div className={`${UI.rule} mb-8`} variants={fadeRise} />

        <motion.form
          className={`${UI.plate} mb-12 flex flex-col gap-2 p-7 max-[600px]:p-5`}
          onSubmit={handleSubmit}
          variants={fadeRise}
        >
          <CornerTicks />
          <AnimatePresence>
            {error && (
              <motion.div
                key="err"
                className="cursor-default rounded-lg border border-solid border-vermilion/30 bg-vermilion-wash px-4 py-3 text-center text-[14px] font-medium text-vermilion"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.div>
            )}
            {success && (
              <motion.div
                key="ok"
                className="cursor-default rounded-lg border border-solid border-verdi/30 bg-sage/30 px-4 py-3 text-center text-[14px] font-medium text-verdi"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {success}
              </motion.div>
            )}
          </AnimatePresence>

          <span className={`mt-2.5 cursor-default ${UI.overlineMuted}`}>
            Topic
          </span>
          <Select
            ariaLabel="Topic"
            className={`${UI.input} cursor-pointer`}
            value={category}
            onChange={setCategory}
            options={CATEGORIES}
          />

          <label
            className={`mt-2.5 cursor-default ${UI.overlineMuted}`}
            htmlFor="support-subject"
          >
            Subject
          </label>
          <input
            id="support-subject"
            className={UI.input}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="A short summary"
            maxLength={120}
          />

          <label
            className={`mt-2.5 cursor-default ${UI.overlineMuted}`}
            htmlFor="support-message"
          >
            Message
          </label>
          <textarea
            id="support-message"
            className={`${UI.input} min-h-32.5 resize-y leading-normal`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what's going on…"
            rows={6}
            maxLength={4000}
          />

          <Button
            type="submit"
            className="mt-4.5 self-end"
            disabled={submitting || !subject.trim() || !message.trim()}
          >
            {submitting ? "Sending…" : "Send dispatch"}
            {!submitting && (
              <span className="text-[11px] text-gold" aria-hidden="true">
                ✦
              </span>
            )}
          </Button>
        </motion.form>

        <motion.div
          className="mb-4 flex items-baseline justify-between gap-3"
          variants={fadeRiseSoft}
        >
          <h2 className="cursor-default font-display text-[22px] font-semibold">
            Your requests
          </h2>
          {!loadingTickets && tickets.length > 0 && (
            <span className={`cursor-default ${UI.overlineMuted}`}>
              {tickets.length} on file
            </span>
          )}
        </motion.div>
        {tickets.length === 0 ? (
          <p className="cursor-default p-5 text-center font-display italic text-[16px] leading-[1.6] text-muted">
            No requests yet. Anything you send will show up here.
          </p>
        ) : (
          <div className={`${UI.plate} overflow-hidden`}>
            <AnimatePresence initial={false}>
              {tickets.map((t) => (
                <motion.div
                  key={t.id}
                  className="cursor-default border-0 border-b border-solid border-line px-6 py-5 last:border-b-0 max-[600px]:px-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  layout
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <span className="cursor-default wrap-break-word text-[15px] font-semibold leading-snug">
                      {t.subject}
                    </span>
                    <StatusSeal status={t.status} />
                  </div>
                  <div className={`mb-2.5 cursor-default ${UI.overlineMuted}`}>
                    <span>{CATEGORY_LABEL[t.category] ?? t.category}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{formatDate(t.created_at)}</span>
                  </div>
                  <p className="cursor-default whitespace-pre-wrap wrap-break-word text-[14.5px] leading-[1.6] text-ink/75">
                    {t.message}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Support;
