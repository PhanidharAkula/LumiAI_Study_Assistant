-- Add the is_admin flag to profiles.
--
-- This column is relied on everywhere (the admin dashboard, and the
-- SECURITY DEFINER admin RPCs admin_get_user_stats / admin_delete_user), but it
-- was previously added by hand with no migration — so a fresh project would
-- break admin. This migration makes it reproducible.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is a safe no-op on the live database
-- where the column already exists. NOT NULL DEFAULT false backfills existing
-- rows automatically (non-destructive).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_admin IS
  'Whether this user has admin privileges (admin dashboard + admin RPCs).';

-- To grant admin to a specific user (run manually as needed):
--   UPDATE public.profiles SET is_admin = true WHERE email = 'you@example.com';
