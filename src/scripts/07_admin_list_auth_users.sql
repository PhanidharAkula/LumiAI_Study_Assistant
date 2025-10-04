-- Helper RPC to list auth.users. Run this in Supabase SQL editor to create
-- an rpc that can be called from the client when using a service role or
-- trusted environment. Be careful exposing this in client builds without
-- proper authentication and server-side checks.

CREATE OR REPLACE FUNCTION public.list_auth_users()
RETURNS TABLE(id uuid, email text, raw_user_meta_data json, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT u.id, u.email, u.raw_user_meta_data, u.created_at
  FROM auth.users u
  ORDER BY u.created_at DESC;
$$;
