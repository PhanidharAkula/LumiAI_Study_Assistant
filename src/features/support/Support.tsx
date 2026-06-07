import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { Session } from "@supabase/supabase-js";
import {
  createTicket,
  getMyTickets,
  type SupportTicket,
} from "@shared/services/supportService";

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

const STATUS_STYLE: Record<string, string> = {
  open: "bg-[#fef3c7] text-[#92400e]",
  in_progress: "bg-[#dbeafe] text-[#1e40af]",
  resolved: "bg-[#dcfce7] text-[#15803d]",
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

// Shared field styling (input / select / textarea).
const FIELD =
  "w-full rounded-[10px] border-[1.5px] border-solid border-ink bg-sage px-3.5 py-3 text-[1rem] font-normal text-ink placeholder:text-ink placeholder:opacity-50 focus:border-ink focus:shadow-[0_0_0_2px_rgba(0,0,0,0.08)] focus:outline-none";

// The custom chevron for the <select> (kept inline — too gnarly as an arbitrary
// Tailwind value because of the data-URI's spaces and quotes).
const selectArrow: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23000000' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
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
      setError(submitError || "Couldn't submit your request. Please try again.");
      return;
    }

    setTickets((prev) => [data, ...prev]);
    setSubject("");
    setMessage("");
    setCategory("general");
    setSuccess("Thanks! We got your message and will reply by email.");
  };

  return (
    <div className="relative min-h-[100dvh] w-full px-5 pt-[84px] pb-[60px] max-[600px]:px-3.5 max-[600px]:pt-[72px] max-[600px]:pb-10">
      <motion.button
        className="back-button absolute left-6 top-6 z-[2] max-[600px]:left-4 max-[600px]:top-4"
        onClick={() => navigate("/dashboard")}
        whileHover={{ x: -3 }}
        whileTap={{ scale: 0.97 }}
        aria-label="Back to dashboard"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
      </motion.button>

      <motion.div
        className="mx-auto max-w-[640px]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="mb-2 cursor-default text-center text-[2rem] font-bold max-[600px]:text-[1.6rem]">
          Help &amp; Support
        </h1>
        <p className="mb-7 cursor-default text-center leading-[1.55] text-muted [&_strong]:font-semibold [&_strong]:text-ink">
          Have a question or run into a snag? Send us a message
          {email ? (
            <>
              {" "}
              and we&apos;ll reply to <strong>{email}</strong>.
            </>
          ) : (
            <> and we&apos;ll get back to you by email.</>
          )}
        </p>

        <form
          className="mb-10 flex flex-col gap-2 rounded-2xl border-[1.5px] border-solid border-ink bg-white p-6 shadow-[0px_2px_0_#000] max-[600px]:p-[18px]"
          onSubmit={handleSubmit}
        >
          <AnimatePresence>
            {error && (
              <motion.div
                key="err"
                className="cursor-default rounded-[10px] border-[1.5px] border-solid border-[#ef4444] bg-[#fee2e2] px-3.5 py-3 text-center font-medium text-[#b91c1c]"
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
                className="cursor-default rounded-[10px] border-[1.5px] border-solid border-[#22c55e] bg-[#dcfce7] px-3.5 py-3 text-center font-medium text-[#15803d]"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {success}
              </motion.div>
            )}
          </AnimatePresence>

          <label
            className="mt-2.5 cursor-default text-[0.95rem] font-semibold"
            htmlFor="support-category"
          >
            Topic
          </label>
          <select
            id="support-category"
            className={`${FIELD} cursor-pointer appearance-none pr-10`}
            style={selectArrow}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <label
            className="mt-2.5 cursor-default text-[0.95rem] font-semibold"
            htmlFor="support-subject"
          >
            Subject
          </label>
          <input
            id="support-subject"
            className={FIELD}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="A short summary"
            maxLength={120}
          />

          <label
            className="mt-2.5 cursor-default text-[0.95rem] font-semibold"
            htmlFor="support-message"
          >
            Message
          </label>
          <textarea
            id="support-message"
            className={`${FIELD} min-h-[130px] resize-y leading-[1.5]`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what's going on…"
            rows={6}
            maxLength={4000}
          />

          <motion.button
            type="submit"
            className="mt-[18px] self-end rounded-full border-[1.5px] border-solid border-ink bg-sage px-7 py-3 text-[1rem] font-semibold text-ink shadow-[0px_2px_0_#000] disabled:cursor-not-allowed disabled:opacity-[0.55]"
            disabled={submitting || !subject.trim() || !message.trim()}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            {submitting ? "Sending…" : "Send message"}
          </motion.button>
        </form>

        <h2 className="mb-4 cursor-default text-[1.25rem] font-bold">
          Your requests
        </h2>
        {loadingTickets ? (
          <p className="cursor-default p-5 text-center text-muted">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="cursor-default p-5 text-center text-muted">
            No requests yet. Anything you send will show up here.
          </p>
        ) : (
          <div className="flex flex-col gap-[14px]">
            <AnimatePresence initial={false}>
              {tickets.map((t) => (
                <motion.div
                  key={t.id}
                  className="cursor-default rounded-[14px] border-[1.5px] border-solid border-ink bg-white p-[18px] shadow-[0px_2px_0_#000]"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  layout
                >
                  <div className="mb-1.5 flex items-start justify-between gap-3">
                    <span className="cursor-default font-semibold">
                      {t.subject}
                    </span>
                    <span
                      className={`shrink-0 cursor-default whitespace-nowrap rounded-full px-2.5 py-1 text-[0.75rem] font-semibold ${STATUS_STYLE[t.status] ?? ""}`}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                  <div className="mb-2.5 cursor-default text-[0.85rem] text-muted">
                    <span>{CATEGORY_LABEL[t.category] ?? t.category}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{formatDate(t.created_at)}</span>
                  </div>
                  <p className="cursor-default whitespace-pre-wrap break-words leading-[1.5]">
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
