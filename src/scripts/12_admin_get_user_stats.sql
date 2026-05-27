-- Admin RPC function to get user statistics
-- This bypasses RLS policies to get accurate counts for all users
-- Run this in Supabase SQL editor as a project owner

-- Drop existing function if it exists
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
  classes_count bigint,
  files_count bigint,
  total_storage bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_id uuid := auth.uid();
  is_admin_user boolean;
BEGIN
  -- Check if caller is admin
  SELECT is_admin INTO is_admin_user
  FROM public.profiles
  WHERE id = caller_id;

  IF NOT COALESCE(is_admin_user, false) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Return user stats with bypassed RLS
  RETURN QUERY
  SELECT 
    u.id as user_id,
    u.email,
    p.full_name,
    p.avatar_url,
    u.created_at,
    p.region,
    u.raw_user_meta_data,
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
'Admin-only function that returns user statistics including classes count, files count, and total storage. Bypasses RLS policies.';
