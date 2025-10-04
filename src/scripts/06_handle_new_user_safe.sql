-- Safe trigger setup: creates an error log table and a fail-soft trigger
-- function for auth.users insert events. Run this if your current
-- trigger/function throws errors and aborts user signups.

CREATE TABLE IF NOT EXISTS public.auth_error_log (
  id bigserial PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  context text,
  error_text text
);

CREATE OR REPLACE FUNCTION public.handle_new_user_safe()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (
      id, email, full_name, avatar_url, metadata, created_at, updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->> 'full_name',
      NEW.raw_user_meta_data->> 'avatar_url',
      COALESCE(NEW.raw_user_meta_data::jsonb, '{}'::jsonb),
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.auth_error_log (context, error_text)
    VALUES (
      'handle_new_user_safe on auth.users insert for id=' || COALESCE(NEW.id::text, 'NULL'),
      SQLERRM || ' / query: ' || COALESCE(current_query(), 'none')
    );
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace existing trigger with safe wrapper
DROP TRIGGER IF EXISTS auth_users_create_profile ON auth.users;

CREATE TRIGGER auth_users_create_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE PROCEDURE public.handle_new_user_safe();
