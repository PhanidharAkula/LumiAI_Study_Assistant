-- Security hardening pass. Run in the Supabase SQL editor. Idempotent + safe to
-- re-run. The anon key ships in the browser (by design, protected by RLS), so
-- every public table MUST have RLS and every SECURITY DEFINER function MUST gate
-- its caller — otherwise the data is reachable by anyone with the anon key.
--
-- BEFORE running, inspect the current state (read-only):
--   select tablename, rowsecurity as rls_enabled from pg_tables
--   where schemaname = 'public' order by tablename;
--   select proname from pg_proc where proname = 'list_auth_users';
--   select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects';
--
-- AFTER running, test: log in, open the dashboard + admin, open a chat, and view
-- a file — all should still work. (Reversible: ALTER TABLE ... DISABLE ROW LEVEL
-- SECURITY; if anything unexpected breaks.)

-- 1) profiles — enable RLS; users may read ONLY their own row.
--    No client write policy on purpose: profiles are written only by the
--    handle_new_user trigger and the set_my_region() RPC (both SECURITY
--    DEFINER), so this also blocks a user from setting is_admin = true on
--    themselves. Admin listing uses admin_get_user_stats() (SECURITY DEFINER),
--    which bypasses RLS. The app only ever reads its own profile from the client.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- 2) auth_error_log — internal signup error log. Enable RLS with no policies so
--    the client can neither read nor write it; the handle_new_user_safe trigger
--    writes to it via SECURITY DEFINER (bypasses RLS).
ALTER TABLE public.auth_error_log ENABLE ROW LEVEL SECURITY;

-- 3) Remove list_auth_users() — an ungated SECURITY DEFINER function that
--    returned every user's id / email / metadata to any caller. Unused by the
--    app (the admin dashboard uses the admin-gated admin_get_user_stats()).
DROP FUNCTION IF EXISTS public.list_auth_users();

-- 4) Storage: a user should only be able to read their OWN files. The previous
--    SELECT policy allowed any authenticated user to read any object in the
--    'files' bucket. (Signed URLs for a user's own files still work.)
DROP POLICY IF EXISTS "Allow authenticated users to read files" ON storage.objects;
CREATE POLICY "Allow authenticated users to read files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'files'
    AND EXISTS (
      SELECT 1 FROM public.files
      WHERE public.files.path = storage.objects.name
        AND public.files.user_id = auth.uid()
    )
  );

-- 5) Backup tables (backup_*). These manual snapshots live in the PUBLIC schema
--    with RLS off, so the anon key can read everyone's data from them — emails,
--    profiles, conversations, files, notes, and (worst) a copy of auth.users in
--    backup_auth_users. They are not used by the app. Lock them down: enable RLS
--    with no policies = no client access at all (the SQL editor / service role
--    can still read them for a restore).
ALTER TABLE IF EXISTS public.backup_auth_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.backup_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.backup_classes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.backup_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.backup_files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.backup_notes         ENABLE ROW LEVEL SECURITY;

-- RECOMMENDED if these backups are stale: dropping them is cleaner than keeping
-- sensitive user data (including auth emails) duplicated in the public schema.
-- Uncomment to remove them entirely:
-- DROP TABLE IF EXISTS
--   public.backup_auth_users,
--   public.backup_profiles,
--   public.backup_classes,
--   public.backup_conversations,
--   public.backup_files,
--   public.backup_notes;
