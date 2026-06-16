import { supabase } from "@shared/lib/supabaseClient";

export interface ClassMastery {
  id: string;
  name: string;
  mastery: number; // 0–100, % of the class's cards that are "mastered"
  mastered: number;
  total: number;
}

export interface Progress {
  hasActivity: boolean;
  currentStreak: number;
  longestStreak: number;
  cardsReviewedThisWeek: number;
  totalCardsStudied: number;
  quizzesTaken: number;
  avgQuizScore: number | null;
  classMastery: ClassMastery[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// A card counts as "mastered" once its review interval reaches a week - at that
// point spaced repetition considers it well-retained.
const MASTERED_INTERVAL_DAYS = 7;

// Local YYYY-MM-DD key for a timestamp (so "a study day" respects the user's
// timezone rather than UTC).
const dayKey = (input: string | Date): string => {
  const d = new Date(input);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

const keyOfDate = (d: Date) => dayKey(d);

function diffDays(aKey: string, bKey: string): number {
  const a = new Date(aKey + "T00:00:00");
  const b = new Date(bKey + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function computeStreaks(dateKeys: string[]): { current: number; longest: number } {
  const set = new Set(dateKeys);
  if (set.size === 0) return { current: 0, longest: 0 };

  // Longest run of consecutive active days.
  const sorted = [...set].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (diffDays(sorted[i - 1]!, sorted[i]!) === 1) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  // Current streak: count back from today. The streak stays alive through today
  // even if today has no activity yet (it breaks only once a full day is missed).
  const cursor = new Date();
  if (!set.has(keyOfDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(keyOfDate(cursor))) return { current: 0, longest };
  }
  let current = 0;
  while (set.has(keyOfDate(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current, longest: Math.max(longest, current) };
}

// Row shapes for the queries below - they document the schema this service
// reads and give it compile-time checking. (Full DB-verified types would come
// from `supabase gen types typescript`; these mirror src/scripts/*.sql.)
interface ClassRow {
  id: string;
  name: string;
}
interface DeckRow {
  id: string;
  class_id: string | null;
  num_cards: number | null;
  created_at: string | null;
}
interface ProgressSrsRow {
  deck_id: string;
  interval_days: number | null;
  last_reviewed_at: string | null;
}
interface QuizRow {
  score: { percentage?: number } | null;
  created_at: string | null;
}
interface DatedRow {
  created_at: string | null;
}

export const getProgress = async (): Promise<Progress | null> => {
  const empty: Progress = {
    hasActivity: false,
    currentStreak: 0,
    longestStreak: 0,
    cardsReviewedThisWeek: 0,
    totalCardsStudied: 0,
    quizzesTaken: 0,
    avgQuizScore: null,
    classMastery: [],
  };

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return empty;

    const queries = await Promise.allSettled([
      supabase
        .from("classes")
        .select("id, name")
        .eq("user_id", user.id)
        .returns<ClassRow[]>(),
      supabase
        .from("flashcard_history")
        .select("id, class_id, num_cards, created_at")
        .eq("user_id", user.id)
        .returns<DeckRow[]>(),
      supabase
        .from("flashcard_srs")
        .select("deck_id, interval_days, last_reviewed_at")
        .eq("user_id", user.id)
        .returns<ProgressSrsRow[]>(),
      supabase
        .from("quiz_history")
        .select("score, created_at")
        .eq("user_id", user.id)
        .returns<QuizRow[]>(),
      supabase
        .from("conversations")
        .select("created_at")
        .eq("user_id", user.id)
        .returns<DatedRow[]>(),
      supabase
        .from("notes")
        .select("created_at")
        .eq("user_id", user.id)
        .returns<DatedRow[]>(),
    ]);

    // One degraded table shouldn't blank the whole screen - treat any failed
    // query (rejected promise OR query error) as empty and carry on with the rest.
    const rows = <T>(i: number): T[] => {
      const r = queries[i];
      if (!r || r.status !== "fulfilled") return [];
      return (r.value as { data: T[] | null }).data ?? [];
    };
    const classes = rows<ClassRow>(0);
    const deckRows = rows<DeckRow>(1);
    const srsRows = rows<ProgressSrsRow>(2);
    const quizRows = rows<QuizRow>(3);
    const convos = rows<DatedRow>(4);
    const notes = rows<DatedRow>(5);

    // ---- Streak: every action that counts as "studying" ----
    const activityDates: string[] = [];
    for (const r of srsRows) if (r.last_reviewed_at) activityDates.push(dayKey(r.last_reviewed_at));
    for (const r of quizRows) if (r.created_at) activityDates.push(dayKey(r.created_at));
    for (const r of convos ?? []) if (r.created_at) activityDates.push(dayKey(r.created_at));
    for (const r of deckRows) if (r.created_at) activityDates.push(dayKey(r.created_at));
    for (const r of notes ?? []) if (r.created_at) activityDates.push(dayKey(r.created_at));

    const { current, longest } = computeStreaks(activityDates);

    // ---- Review counts ----
    // Distinct cards whose most recent review falls in the trailing 7 days (the
    // SRS row stores only last_reviewed_at, so this is "cards reviewed this
    // week", counted once per card, not a raw review tally). totalCardsStudied
    // is distinct cards ever reviewed.
    const weekAgo = Date.now() - 7 * MS_PER_DAY;
    let cardsReviewedThisWeek = 0;
    let totalCardsStudied = 0;
    for (const r of srsRows) {
      if (!r.last_reviewed_at) continue;
      totalCardsStudied += 1;
      if (new Date(r.last_reviewed_at).getTime() >= weekAgo) cardsReviewedThisWeek += 1;
    }

    // ---- Quizzes ----
    const quizzesTaken = quizRows.length;
    const pcts = quizRows
      .map((q) => Number(q.score?.percentage))
      .filter((p) => Number.isFinite(p));
    const avgQuizScore =
      pcts.length > 0 ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null;

    // ---- Per-class mastery (latest deck per class) ----
    // A class can accumulate several generated decks over time; summing them all
    // would inflate the denominator, so regenerating a class's cards would drop
    // its mastery even though nothing was forgotten. Measure mastery against the
    // most recent deck per class - the cards the student is actually working from.
    const classNameById = new Map<string, string>();
    for (const c of classes ?? []) classNameById.set(c.id, c.name);

    const latestDeckByClass = new Map<
      string,
      { deckId: string; total: number; createdAt: number }
    >();
    for (const d of deckRows) {
      if (!d.class_id) continue;
      const createdAt = d.created_at ? new Date(d.created_at).getTime() : 0;
      const cur = latestDeckByClass.get(d.class_id);
      if (!cur || createdAt > cur.createdAt) {
        latestDeckByClass.set(d.class_id, {
          deckId: d.id,
          total: d.num_cards ?? 0,
          createdAt,
        });
      }
    }

    // Tally mastery only against each class's latest deck.
    const latestDeckToClass = new Map<string, string>();
    for (const [classId, info] of latestDeckByClass)
      latestDeckToClass.set(info.deckId, classId);

    const masteredByClass = new Map<string, number>();
    for (const r of srsRows) {
      const classId = latestDeckToClass.get(r.deck_id);
      if (!classId) continue;
      if (Number(r.interval_days) >= MASTERED_INTERVAL_DAYS) {
        masteredByClass.set(classId, (masteredByClass.get(classId) ?? 0) + 1);
      }
    }

    const classMastery: ClassMastery[] = [];
    for (const [classId, info] of latestDeckByClass) {
      if (info.total <= 0) continue;
      const mastered = masteredByClass.get(classId) ?? 0;
      classMastery.push({
        id: classId,
        name: classNameById.get(classId) ?? "Class",
        mastered,
        total: info.total,
        mastery: Math.min(100, Math.round((mastered / info.total) * 100)),
      });
    }
    classMastery.sort((a, b) => b.mastery - a.mastery);

    const hasActivity =
      activityDates.length > 0 || quizzesTaken > 0 || totalCardsStudied > 0;

    return {
      hasActivity,
      currentStreak: current,
      longestStreak: longest,
      cardsReviewedThisWeek,
      totalCardsStudied,
      quizzesTaken,
      avgQuizScore,
      classMastery,
    };
  } catch (err) {
    console.error("getProgress error:", err);
    return null;
  }
};
