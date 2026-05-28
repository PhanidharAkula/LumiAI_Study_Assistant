-- 27_create_flashcard_srs_table.sql
-- Spaced-repetition scheduling for individual flashcards. A card is identified
-- by its deck (flashcard_history.id) plus its index in that deck's `cards`
-- JSONB array. A card with no row here is "new" (due immediately); once
-- reviewed, its row tracks the SM-2 ease/interval and the next due date.
-- Additive only — existing flashcard data is untouched.

CREATE TABLE IF NOT EXISTS public.flashcard_srs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES public.flashcard_history(id) ON DELETE CASCADE,
  card_index INTEGER NOT NULL,
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deck_id, card_index)
);

CREATE INDEX IF NOT EXISTS idx_flashcard_srs_user_due
  ON public.flashcard_srs(user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_flashcard_srs_deck
  ON public.flashcard_srs(deck_id);

ALTER TABLE public.flashcard_srs ENABLE ROW LEVEL SECURITY;

-- Users manage only their own scheduling rows. FOR ALL covers select / insert /
-- update / delete, including the upserts written during review.
DROP POLICY IF EXISTS "Users manage own flashcard SRS" ON public.flashcard_srs;
CREATE POLICY "Users manage own flashcard SRS"
  ON public.flashcard_srs
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
