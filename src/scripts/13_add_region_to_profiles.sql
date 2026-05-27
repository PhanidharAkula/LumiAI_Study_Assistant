-- Add the region column to profiles (used by the admin dashboard's region
-- filter and analytics).
--
-- Region is captured client-side on login via set_my_region() (15) and, when
-- present in signup metadata, by the handle_new_user_safe() trigger (14).
-- Idempotent: only adds the column if it's missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'region'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN region TEXT;
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.region IS
  'User region/location. Captured on login (set_my_region) or from signup metadata. Used for admin filtering and analytics.';
