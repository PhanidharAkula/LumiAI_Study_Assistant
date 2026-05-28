import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { createTicket, getMyTickets } from "../services/supportService";
import "./Support.css";

const CATEGORIES = [
  { value: "general", label: "General question" },
  { value: "account", label: "Account & login" },
  { value: "bug", label: "Something's broken" },
  { value: "feature", label: "Feature request" },
  { value: "other", label: "Other" },
];

const STATUS_LABEL = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

const CATEGORY_LABEL = CATEGORIES.reduce((acc, c) => {
  acc[c.value] = c.label;
  return acc;
}, {});

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const Support = ({ session }) => {
  const navigate = useNavigate();
  const email = session?.user?.email;

  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [tickets, setTickets] = useState([]);
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

  const handleSubmit = async (e) => {
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
    <div className="support-page">
      <motion.button
        className="back-button support-back"
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
        className="support-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="support-title">Help &amp; Support</h1>
        <p className="support-subtitle">
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

        <form className="support-card" onSubmit={handleSubmit}>
          <AnimatePresence>
            {error && (
              <motion.div
                key="err"
                className="support-error"
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
                className="support-success"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {success}
              </motion.div>
            )}
          </AnimatePresence>

          <label className="support-label" htmlFor="support-category">
            Topic
          </label>
          <select
            id="support-category"
            className="support-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <label className="support-label" htmlFor="support-subject">
            Subject
          </label>
          <input
            id="support-subject"
            className="support-input"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="A short summary"
            maxLength={120}
          />

          <label className="support-label" htmlFor="support-message">
            Message
          </label>
          <textarea
            id="support-message"
            className="support-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us what's going on…"
            rows={6}
            maxLength={4000}
          />

          <motion.button
            type="submit"
            className="support-submit"
            disabled={submitting || !subject.trim() || !message.trim()}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
          >
            {submitting ? "Sending…" : "Send message"}
          </motion.button>
        </form>

        <h2 className="support-section-title">Your requests</h2>
        {loadingTickets ? (
          <p className="support-empty">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="support-empty">
            No requests yet. Anything you send will show up here.
          </p>
        ) : (
          <div className="support-ticket-list">
            <AnimatePresence initial={false}>
              {tickets.map((t) => (
                <motion.div
                  key={t.id}
                  className="support-ticket-card"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  layout
                >
                  <div className="support-ticket-head">
                    <span className="support-ticket-subject">{t.subject}</span>
                    <span className={`support-status support-status--${t.status}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                  <div className="support-ticket-meta">
                    <span>{CATEGORY_LABEL[t.category] ?? t.category}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{formatDate(t.created_at)}</span>
                  </div>
                  <p className="support-ticket-message">{t.message}</p>
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
