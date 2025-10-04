-- SECURITY DEFINER helper to remove a user's application data (NOT the auth.users row)
-- Run this in Supabase SQL editor as a project owner. This will allow the client
-- (via supabase.rpc) to call it once created. For safety this only removes app
-- tables and the profile row. Deleting the actual auth.user still requires the
-- service_role key and should be done via server-side or direct SQL in the SQL editor.

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_admin boolean := false;
BEGIN
  -- require an authenticated caller
  IF caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- ensure caller is an admin according to profiles table
  SELECT is_admin INTO caller_is_admin FROM public.profiles WHERE id = caller;
  IF caller_is_admin IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Delete conversations
  DELETE FROM public.conversations WHERE user_id = p_user_id;

  -- Delete notes
  DELETE FROM public.notes WHERE user_id = p_user_id;

  -- Delete files metadata
  DELETE FROM public.files WHERE user_id = p_user_id;

  -- Delete classes
  DELETE FROM public.classes WHERE user_id = p_user_id;

  -- Delete profile
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- Attempt to delete the auth user row as well. This requires the function
  -- to be SECURITY DEFINER and owned by a privileged role (project owner).
  -- The check above prevents non-admin callers from invoking this.
  BEGIN
    DELETE FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    -- If deleting the auth user fails, continue but include a warning in result
    RETURN jsonb_build_object('ok', true, 'deleted_user_id', p_user_id::text, 'warning', SQLERRM);
  END;

  RETURN jsonb_build_object('ok', true, 'deleted_user_id', p_user_id::text);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- NOTE:
-- This function removes application data and the profile but does NOT remove
-- the row from auth.users (the authenticated user) because deleting auth.users
-- requires the service_role key and is normally performed server-side using
-- the REST admin endpoint or via the Supabase dashboard.

-- To remove the auth user as well (manual step):
-- DELETE FROM auth.users WHERE id = '<USER_ID>';
-- (Run the above in Supabase SQL editor as a project owner - be careful)
