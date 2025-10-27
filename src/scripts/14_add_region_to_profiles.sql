-- Add region column to profiles table to track user location
-- This helps admin dashboard filter and organize users by region

-- Add region column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'region'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN region TEXT;
  END IF;
END $$;

-- Update the handle_new_user function to capture region from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Attempt to create a matching profile. Use COALESCE/->> to extract
  -- commonly provided metadata fields from raw_user_meta_data if present.
  INSERT INTO public.profiles (id, email, full_name, avatar_url, metadata, region)
  VALUES (
    NEW.id,
    NEW.email,
    -- Use raw_user_meta_data which is commonly present
    NEW.raw_user_meta_data->> 'full_name',
    NEW.raw_user_meta_data->> 'avatar_url',
    COALESCE(NEW.raw_user_meta_data::jsonb, '{}'::jsonb),
    -- Extract region from metadata if provided, otherwise NULL
    NEW.raw_user_meta_data->> 'region'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    metadata = EXCLUDED.metadata,
    region = EXCLUDED.region,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN public.profiles.region IS 
'User region/location detected at account creation time. Used for admin filtering and analytics.';
