-- Function to allow users to delete their own account and all associated data
-- This is different from admin_delete_user which requires admin privileges
-- Run this in Supabase SQL editor as a project owner

CREATE OR REPLACE FUNCTION public.user_delete_own_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_id uuid := auth.uid();
  user_email text;
  deleted_count integer;
BEGIN
  -- Require an authenticated caller
  IF caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Get the user's email before deleting
  SELECT email INTO user_email FROM auth.users WHERE id = caller_id;
  
  -- Record this deletion in deleted_accounts table
  IF user_email IS NOT NULL THEN
    INSERT INTO public.deleted_accounts (email, deleted_by, deleted_at, can_reregister_at)
    VALUES (
      lower(user_email), 
      caller_id, 
      now(), 
      now() + interval '0 seconds'  -- 0 second cooldown for production
    )
    ON CONFLICT (email) DO UPDATE
    SET deleted_at = now(),
        deleted_by = caller_id,
        can_reregister_at = now() + interval '0 seconds';  -- 0 second cooldown for production
  END IF;

  -- Delete quiz history
  DELETE FROM public.quiz_history WHERE user_id = caller_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % quiz history records', deleted_count;

  -- Delete conversations
  DELETE FROM public.conversations WHERE user_id = caller_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % conversation records', deleted_count;

  -- Delete notes
  DELETE FROM public.notes WHERE user_id = caller_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % note records', deleted_count;

  -- Get all file paths before deleting (for storage cleanup on client side)
  -- Note: The actual storage file deletion will be handled by the client/API
  -- since this SQL function cannot directly access Supabase Storage

  -- Delete files metadata
  DELETE FROM public.files WHERE user_id = caller_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % file metadata records', deleted_count;

  -- Delete classes
  DELETE FROM public.classes WHERE user_id = caller_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % class records', deleted_count;

  -- Delete profile
  DELETE FROM public.profiles WHERE id = caller_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % profile records', deleted_count;

  -- Attempt to delete the auth user as well
  -- This requires the function to be SECURITY DEFINER and owned by a privileged role
  -- If this fails, the user will need to contact support or the auth session will expire
  BEGIN
    DELETE FROM auth.users WHERE id = caller_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
      RAISE NOTICE 'Successfully deleted auth user';
      RETURN jsonb_build_object('ok', true, 'deleted_user_id', caller_id::text, 'auth_deleted', true);
    ELSE
      RAISE NOTICE 'Auth user not found or already deleted';
      RETURN jsonb_build_object('ok', true, 'deleted_user_id', caller_id::text, 'auth_deleted', false, 'warning', 'Auth user not found');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If deleting the auth user fails, continue but include a warning
    RAISE NOTICE 'Could not delete auth user: %', SQLERRM;
    RETURN jsonb_build_object('ok', true, 'deleted_user_id', caller_id::text, 'auth_deleted', false, 'warning', 'Could not delete auth user - will expire on next login');
  END;
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.user_delete_own_account() IS 
'Allows authenticated users to delete their own account data. This removes all classes, files, notes, conversations, quiz history, profile, and attempts to delete the auth user record.';

