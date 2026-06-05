-- 28_admin_user_admin_toggle.sql
-- Lets an admin grant/revoke another user's admin access from the Admin panel.
--   1) admin_get_user_stats() now also returns each user's is_admin flag so the
--      toggle can reflect current state. (Recreated: the return type changes, so
--      it must be dropped and recreated; search_path + grants are re-applied to
--      preserve the hardening from migration 25.)
--   2) admin_set_user_admin(target_user_id, make_admin) sets profiles.is_admin
--      for another user. Admin-gated, and refuses to change the caller's own row
--      (prevents an admin from accidentally locking themselves out).
-- Run in the Supabase SQL editor as project owner.

-- 1) Recreate the stats function with is_admin -----------------------------------
DROP FUNCTION IF EXISTS public.admin_get_user_stats();

CREATE OR REPLACE FUNCTION public.admin_get_user_stats()
RETURNS TABLE(
  user_id uuid,
  email varchar,
  full_name text,
  avatar_url text,
  created_at timestamptz,
  region text,
  raw_user_meta_data jsonb,
  is_admin boolean,
  classes_count bigint,
  files_count bigint,
  total_storage bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  is_admin_user boolean;
BEGIN
  SELECT p.is_admin INTO is_admin_user
  FROM public.profiles p
  WHERE p.id = caller_id;

  IF NOT COALESCE(is_admin_user, false) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT
    u.id as user_id,
    u.email,
    p.full_name,
    p.avatar_url,
    u.created_at,
    p.region,
    u.raw_user_meta_data,
    COALESCE(p.is_admin, false) as is_admin,
    COALESCE(c.classes_count, 0) as classes_count,
    COALESCE(f.files_count, 0) as files_count,
    COALESCE(f.total_storage, 0) as total_storage
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN (
    SELECT classes.user_id as user_id, COUNT(*) as classes_count
    FROM public.classes
    GROUP BY classes.user_id
  ) c ON c.user_id = u.id
  LEFT JOIN (
    SELECT files.user_id as user_id, COUNT(*) as files_count, SUM(COALESCE(files.size, 0)) as total_storage
    FROM public.files
    GROUP BY files.user_id
  ) f ON f.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_user_stats() IS
'Admin-only function that returns user statistics (incl. is_admin). Bypasses RLS.';

-- Re-apply execute privileges (DROP reset them to the default PUBLIC grant).
REVOKE EXECUTE ON FUNCTION public.admin_get_user_stats() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_get_user_stats() TO authenticated;

-- 2) Grant/revoke another user's admin access ------------------------------------
DROP FUNCTION IF EXISTS public.admin_set_user_admin(uuid, boolean);

CREATE OR REPLACE FUNCTION public.admin_set_user_admin(
  target_user_id uuid,
  make_admin boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  is_admin_user boolean;
  updated_count integer;
BEGIN
  -- Caller must be an admin.
  SELECT p.is_admin INTO is_admin_user
  FROM public.profiles p
  WHERE p.id = caller_id;

  IF NOT COALESCE(is_admin_user, false) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Never let an admin change their own row (avoids self-lockout).
  IF caller_id = target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_change_self');
  END IF;

  UPDATE public.profiles
  SET is_admin = make_admin
  WHERE id = target_user_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', target_user_id::text,
    'is_admin', make_admin
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.admin_set_user_admin(uuid, boolean) IS
'Admin-only function to grant/revoke another user''s admin access. Refuses to change the caller''s own row.';

REVOKE EXECUTE ON FUNCTION public.admin_set_user_admin(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_admin(uuid, boolean) TO authenticated;
