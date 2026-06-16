import { supabase } from "@shared/lib/supabaseClient";

export type SrsRating = "again" | "hard" | "good" | "easy";

export interface SrsState {
  ease: number;
  interval_days: number;
  repetitions: number;
}

export interface ReviewCard {
  deckId: string;
  cardIndex: number;
  front: string;
  back: string;
  category: string | null;
  className: string;
  srs: SrsState | null; // null => brand-new card, never reviewed
}

// Shape of a flashcard_srs row as the queue reads it (documents the schema +
// gives the service compile-time checking; mirrors src/scripts/27_*.sql).
interface SrsQueueRow {
  deck_id: string;
  card_index: number;
  ease: number;
  interval_days: number;
  repetitions: number;
  due_at: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NEW_CARDS_PER_SESSION = 20;

const defaultSrs = (): SrsState => ({
  ease: 2.5,
  interval_days: 0,
  repetitions: 0,
});

// SM-2-lite: given the current state (or null for a new card) and the rating,
// compute the next scheduling state + due date.
function computeNext(srs: SrsState | null, rating: SrsRating) {
  let ease = srs?.ease ?? 2.5;
  let interval = srs?.interval_days ?? 0;
  let reps = srs?.repetitions ?? 0;

  switch (rating) {
    case "again":
      reps = 0;
      interval = 0;
      ease -= 0.2;
      break;
    case "hard":
      reps += 1;
      interval = interval <= 0 ? 1 : interval * 1.2;
      ease -= 0.15;
      break;
    case "good":
      reps += 1;
      interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ease);
      break;
    case "easy":
      reps += 1;
      interval = reps === 1 ? 4 : Math.round(interval * ease * 1.3);
      ease += 0.15;
      break;
  }

  ease = Math.min(3.0, Math.max(1.3, ease));
  if (interval < 0) interval = 0;

  // "again" keeps the card due within the same session (~1 min); the rest are
  // scheduled days into the future.
  const dueMs = rating === "again" ? 60 * 1000 : interval * MS_PER_DAY;

  return {
    ease,
    interval_days: interval,
    repetitions: reps,
    due_at: new Date(Date.now() + dueMs).toISOString(),
    last_reviewed_at: new Date().toISOString(),
  };
}

// Lightweight count of cards to review now (existing due rows + new cards),
// without fetching the heavy `cards` JSONB. Powers the dashboard badge.
export const getDueCount = async (): Promise<number> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;

    const [{ data: decks }, { data: srs }] = await Promise.all([
      supabase
        .from("flashcard_history")
        .select("id, num_cards")
        .eq("user_id", user.id)
        .returns<{ id: string; num_cards: number | null }[]>(),
      supabase
        .from("flashcard_srs")
        .select("deck_id, due_at")
        .eq("user_id", user.id)
        .returns<{ deck_id: string; due_at: string }[]>(),
    ]);

    const now = Date.now();
    const dueRows = (srs ?? []).filter(
      (r) => new Date(r.due_at).getTime() <= now
    ).length;

    const srsCountByDeck = new Map<string, number>();
    for (const r of srs ?? []) {
      srsCountByDeck.set(r.deck_id, (srsCountByDeck.get(r.deck_id) ?? 0) + 1);
    }
    let newCards = 0;
    for (const d of decks ?? []) {
      newCards += Math.max(0, (d.num_cards ?? 0) - (srsCountByDeck.get(d.id) ?? 0));
    }

    return dueRows + Math.min(newCards, NEW_CARDS_PER_SESSION);
  } catch (err) {
    console.error("getDueCount error:", err);
    return 0;
  }
};

// Full review queue with card content: due cards first (oldest due first),
// then a capped number of new cards.
export const getReviewQueue = async (): Promise<{
  cards: ReviewCard[];
  hasDecks: boolean;
  error: boolean;
}> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { cards: [], hasDecks: false, error: false };

    const [{ data: decks }, { data: srs }, { data: classes }] =
      await Promise.all([
        supabase
          .from("flashcard_history")
          .select("id, class_id, cards")
          .eq("user_id", user.id)
          .returns<{ id: string; class_id: string; cards: unknown }[]>(),
        supabase
          .from("flashcard_srs")
          .select("deck_id, card_index, ease, interval_days, repetitions, due_at")
          .eq("user_id", user.id)
          .returns<SrsQueueRow[]>(),
        supabase
          .from("classes")
          .select("id, name")
          .eq("user_id", user.id)
          .returns<{ id: string; name: string }[]>(),
      ]);

    if (!decks || decks.length === 0) return { cards: [], hasDecks: false, error: false };

    const classNameById = new Map<string, string>();
    for (const c of classes ?? []) classNameById.set(c.id, c.name);

    const srsByKey = new Map<string, SrsQueueRow>();
    for (const r of srs ?? []) srsByKey.set(`${r.deck_id}:${r.card_index}`, r);

    const now = Date.now();
    const due: { card: ReviewCard; dueAt: number }[] = [];
    const fresh: ReviewCard[] = [];

    for (const deck of decks) {
      const cards = Array.isArray(deck.cards) ? deck.cards : [];
      cards.forEach((card: { front?: string; back?: string; category?: string }, idx: number) => {
        const row = srsByKey.get(`${deck.id}:${idx}`);
        const base: ReviewCard = {
          deckId: deck.id,
          cardIndex: idx,
          front: card?.front ?? "",
          back: card?.back ?? "",
          category: card?.category ?? null,
          className: classNameById.get(deck.class_id) ?? "Flashcards",
          srs: row
            ? {
                ease: Number(row.ease),
                interval_days: Number(row.interval_days),
                repetitions: Number(row.repetitions),
              }
            : null,
        };
        if (!row) {
          fresh.push(base);
        } else if (new Date(String(row.due_at)).getTime() <= now) {
          due.push({ card: base, dueAt: new Date(String(row.due_at)).getTime() });
        }
      });
    }

    due.sort((a, b) => a.dueAt - b.dueAt);
    const queue = [
      ...due.map((d) => d.card),
      ...fresh.slice(0, NEW_CARDS_PER_SESSION),
    ];

    return { cards: queue, hasDecks: true, error: false };
  } catch (err) {
    console.error("getReviewQueue error:", err);
    return { cards: [], hasDecks: true, error: true };
  }
};

// Record a review and persist the next scheduling state. Returns the new state
// so the caller can keep it in memory (e.g. for an "again" re-review).
export const recordReview = async (
  card: ReviewCard,
  rating: SrsRating
): Promise<{ srs: SrsState; error: string | null }> => {
  const next = computeNext(card.srs, rating);
  const nextSrs: SrsState = {
    ease: next.ease,
    interval_days: next.interval_days,
    repetitions: next.repetitions,
  };
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { srs: card.srs ?? defaultSrs(), error: "Please sign in." };

    const { error } = await supabase.from("flashcard_srs").upsert(
      {
        user_id: user.id,
        deck_id: card.deckId,
        card_index: card.cardIndex,
        ...next,
      },
      { onConflict: "deck_id,card_index" }
    );
    if (error) throw error;
    return { srs: nextSrs, error: null };
  } catch (err) {
    console.error("recordReview error:", err);
    return { srs: nextSrs, error: "Couldn't save your progress." };
  }
};
