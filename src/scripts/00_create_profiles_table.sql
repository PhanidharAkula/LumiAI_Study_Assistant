-- Create a simple profiles table and a trigger to populate it when a new
-- user is created in the auth.users table. This addresses the common
-- "Database error saving new user" error when Supabase attempts to write
-- user metadata on signup but the table/trigger is missing or misconfigured.

-- 1) Create profiles table (id references auth.users.id)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Function to insert a profile for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Attempt to create a matching profile. Use COALESCE/->> to extract
  -- commonly provided metadata fields from raw_user_meta_data if present.
  INSERT INTO public.profiles (id, email, full_name, avatar_url, metadata)
  VALUES (
    NEW.id,
    NEW.email,
    -- Use raw_user_meta_data which is commonly present; avoid
    -- referencing user_metadata which may not exist in some projects.
    NEW.raw_user_meta_data->> 'full_name',
    NEW.raw_user_meta_data->> 'avatar_url',
    COALESCE(NEW.raw_user_meta_data::jsonb, '{}'::jsonb)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) Trigger on auth.users to call function after insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'auth_users_create_profile'
  ) THEN
    CREATE TRIGGER auth_users_create_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_new_user();
  END IF;
END;
$$;

-- 4) Optional index/constraints
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);

COMMENT ON TABLE public.profiles IS 'User profiles: mirrors auth.users id and stores lightweight metadata and avatar.';

-- End of migration
