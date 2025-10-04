-- Backfill profiles for any existing users in auth.users that do not
-- have a corresponding row in public.profiles. Run this in the Supabase
-- SQL editor if you already have users but no profiles table or missing rows.

INSERT INTO public.profiles (id, email, full_name, avatar_url, metadata, created_at, updated_at)
SELECT
  u.id,
  u.email,
  -- Use raw_user_meta_data which exists on auth.users. Some Supabase
  -- deployments don't expose a separate `user_metadata` column, so
  -- avoid referencing it to prevent column-not-found errors.
  u.raw_user_meta_data->> 'full_name',
  u.raw_user_meta_data->> 'avatar_url',
  COALESCE(u.raw_user_meta_data::jsonb, '{}'::jsonb),
  now(),
  now()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Verify rows created
SELECT count(*) AS profiles_backfilled FROM public.profiles;
