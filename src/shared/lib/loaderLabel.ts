/**
 * The global-loader text for a destination, derived from the URL so EVERY load
 * phase (auth, route chunk, page data) shows the SAME label - no flashing from a
 * generic "Charting" through "Charting your sky" before the real one. Shared by
 * App (boot + route) and Dashboard (data phase) so they can't drift.
 *
 * On /dashboard the open overlay (flashcards/quiz/chat/talk, carried in the
 * query) wins, then an open class (classId), so a deep-link names the tool or
 * class rather than the dashboard.
 */
const ROUTE_LABELS: Record<string, string> = {
  "/admin": "Reading the instruments",
  "/support": "Opening the desk",
  "/review": "Gathering your cards",
  "/progress": "Charting your progress",
  "/auth/callback": "Signing you in",
};

export function loaderLabel(pathname: string, search: string): string {
  if (pathname === "/dashboard") {
    const p = new URLSearchParams(search);
    if (p.get("flashcards") === "true") return "Dealing the deck";
    if (p.get("quiz") === "true") return "Plotting the quiz";
    if (p.get("chat") === "true") return "Opening the chat";
    if (p.get("talk") === "true") return "Tuning in";
    if (p.get("classId")) return "Opening the class";
    return "Charting your sky";
  }
  return ROUTE_LABELS[pathname] ?? "Charting";
}
