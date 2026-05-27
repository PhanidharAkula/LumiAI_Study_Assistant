-- Function hardening — clears the Supabase advisor warnings:
--   * "Function Search Path Mutable"  -> pin search_path on every function.
--   * "Public Can Execute SECURITY DEFINER Function" -> revoke anon execute.
--   * "RLS Policy Always True" (deleted_accounts) -> drop the permissive insert policy.
-- These are best-practice WARNINGS (not active vulnerabilities). Run in the
-- Supabase SQL editor, then test: sign up a new user, send a chat, generate a
-- quiz/flashcards, the account-deletion flow, and the admin dashboard.
-- Reversible (ALTER FUNCTION ... RESET search_path; / re-GRANT EXECUTE).

-- 1) Pin search_path. All function bodies are fully schema-qualified
--    (public.x / auth.x), so '' (the strictest, recommended value) is safe.
ALTER FUNCTION public.handle_new_user()                      SET search_path = '';
ALTER FUNCTION public.handle_new_user_safe()                 SET search_path = '';
ALTER FUNCTION public.update_quiz_history_updated_at()       SET search_path = '';
ALTER FUNCTION public.update_flashcard_history_updated_at()  SET search_path = '';
ALTER FUNCTION public.cleanup_old_deleted_accounts()         SET search_path = '';
ALTER FUNCTION public.admin_get_user_stats()                 SET search_path = '';
ALTER FUNCTION public.admin_delete_user(uuid)                SET search_path = '';
ALTER FUNCTION public.set_my_region(text)                    SET search_path = '';
ALTER FUNCTION public.user_delete_own_account()              SET search_path = '';

-- 2) EXECUTE privileges on the SECURITY DEFINER functions.
--    Trigger + internal functions are NOT meant to be called via the API. The
--    triggers still fire — a trigger runs its function as the table owner, not
--    via the caller's EXECUTE privilege — so revoking is safe.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_safe()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_quiz_history_updated_at()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_flashcard_history_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_deleted_accounts()        FROM PUBLIC, anon, authenticated;

--    User-facing RPCs: signed-in users only, never anonymous. They still gate
--    further internally (admin_* check is_admin; set_my_region / delete use
--    auth.uid()). The remaining "signed-in users can execute" advisor note on
--    these four is expected — the app calls them as an authenticated user.
REVOKE EXECUTE ON FUNCTION public.admin_get_user_stats()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_my_region(text)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_delete_own_account()   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_get_user_stats()      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_delete_user(uuid)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_my_region(text)         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_delete_own_account()   TO authenticated;

-- 3) deleted_accounts: drop the "always true" insert policy. Inserts happen only
--    through the SECURITY DEFINER delete functions (which bypass RLS as owner),
--    so the client never needs a direct insert policy.
DROP POLICY IF EXISTS "System can insert deleted accounts" ON public.deleted_accounts;
