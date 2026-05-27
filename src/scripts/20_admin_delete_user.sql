-- Admin-only RPC: delete any user's account and all associated data.
-- Called by the Admin dashboard's per-user "Delete" button (admin_delete_user).
-- Requires admin privileges. Run this in the Supabase SQL editor as project owner.
--
-- This re-documents the function that already exists in production — its original
-- migration (08_admin_delete_user.sql) was removed during the Phase-2 cleanup.
-- ONE change vs. the live version: it now also deletes the target user's
-- flashcard_history rows. That table was added later (migration 17) and this
-- cleanup was missing here, so admin-deleting a user left orphaned flashcard
-- history — this mirrors the fix already applied to user_delete_own_account in
-- migration 19. Running this both documents and applies that fix; behaviour is
-- otherwise identical (idempotent CREATE OR REPLACE).

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_id uuid := auth.uid();
  is_admin_user boolean;
  user_email text;
  deleted_count integer;
BEGIN
  -- Check if caller is admin
  SELECT is_admin INTO is_admin_user
  FROM public.profiles
  WHERE id = caller_id;

  IF NOT COALESCE(is_admin_user, false) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Prevent admins from deleting themselves
  IF caller_id = target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_delete_self');
  END IF;

  -- Get the user's email before deleting
  SELECT email INTO user_email FROM auth.users WHERE id = target_user_id;

  IF user_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- Record this deletion in deleted_accounts table
  INSERT INTO public.deleted_accounts (email, deleted_by, deleted_at, can_reregister_at, reason)
  VALUES (
    lower(user_email),
    caller_id,
    now(),
    now() + interval '0 seconds',  -- 0 second cooldown for production
    'deleted_by_admin'
  )
  ON CONFLICT (email) DO UPDATE
  SET deleted_at = now(),
      deleted_by = caller_id,
      can_reregister_at = now() + interval '0 seconds',  -- 0 second cooldown for production
      reason = 'deleted_by_admin';

  -- Delete flashcard history (added vs. the original prod function — the
  -- flashcard_history table came in migration 17 and was not cleaned up here).
  DELETE FROM public.flashcard_history WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % flashcard history records', deleted_count;

  -- Delete quiz history
  DELETE FROM public.quiz_history WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % quiz history records', deleted_count;

  -- Delete conversations
  DELETE FROM public.conversations WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % conversation records', deleted_count;

  -- Delete notes
  DELETE FROM public.notes WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % note records', deleted_count;

  -- Delete files metadata
  DELETE FROM public.files WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % file metadata records', deleted_count;

  -- Delete classes
  DELETE FROM public.classes WHERE user_id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % class records', deleted_count;

  -- Delete profile
  DELETE FROM public.profiles WHERE id = target_user_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % profile records', deleted_count;

  -- Delete the auth user
  BEGIN
    DELETE FROM auth.users WHERE id = target_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN
      RAISE NOTICE 'Successfully deleted auth user';
      RETURN jsonb_build_object(
        'ok', true,
        'deleted_user_id', target_user_id::text,
        'deleted_email', user_email,
        'auth_deleted', true
      );
    ELSE
      RAISE NOTICE 'Auth user not found or already deleted';
      RETURN jsonb_build_object(
        'ok', true,
        'deleted_user_id', target_user_id::text,
        'deleted_email', user_email,
        'auth_deleted', false,
        'warning', 'Auth user not found'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not delete auth user: %', SQLERRM;
    RETURN jsonb_build_object(
      'ok', true,
      'deleted_user_id', target_user_id::text,
      'deleted_email', user_email,
      'auth_deleted', false,
      'warning', 'Could not delete auth user - ' || SQLERRM
    );
  END;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.admin_delete_user(uuid) IS
'Admin-only function to delete any user account and all associated data (incl. flashcard_history). Records deletion in deleted_accounts table.';
