-- Harden RLS on classes / files / notes: add WITH CHECK to their FOR ALL
-- policies. The originals (02/03/04) only had USING (user_id = auth.uid()),
-- which gates which rows a user can READ/UPDATE/DELETE but does NOT constrain the
-- row being WRITTEN - so a user could INSERT, or UPDATE, a row with user_id set
-- to someone else (attributing data to another account). WITH CHECK closes that.
-- conversations / quiz_history / flashcard_history / flashcard_srs already use
-- the correct per-op or USING+WITH CHECK pattern. Run this in the Supabase SQL editor.

DROP POLICY IF EXISTS "Users can manage their own classes" ON public.classes;
CREATE POLICY "Users can manage their own classes" ON public.classes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage their own files" ON public.files;
CREATE POLICY "Users can manage their own files" ON public.files
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage their own notes" ON public.notes;
CREATE POLICY "Users can manage their own notes" ON public.notes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
