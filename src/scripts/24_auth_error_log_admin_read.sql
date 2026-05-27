-- Give auth_error_log an explicit admin-only SELECT policy. This clears the
-- Supabase "RLS enabled, no policy" advisor warning and lets admins view signup
-- errors, while keeping the table closed to regular users. The
-- handle_new_user_safe trigger writes to it via SECURITY DEFINER (bypasses RLS),
-- so logging is unaffected. Run in the Supabase SQL editor. Idempotent.

DROP POLICY IF EXISTS "Admins can read the auth error log" ON public.auth_error_log;
CREATE POLICY "Admins can read the auth error log"
  ON public.auth_error_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- Note: the six backup_* tables are intentionally locked with RLS + no policy.
-- The clean way to clear their advisor warnings is to drop them (they're stale
-- snapshots of sensitive data) — see the DROP block in 23_security_hardening.sql.
