-- Region capture RPC: lets a signed-in user persist their own detected region.
--
-- profiles has RLS and no user-facing UPDATE policy, so a direct client
-- `update(profiles).set(region)` is blocked (updates 0 rows silently) — which
-- is why region never persisted before. This SECURITY DEFINER function lets the
-- client record the browser-detected region WITHOUT opening profiles up to
-- arbitrary client writes. It only ever touches the CALLER's own row, and only
-- when region is still empty/'Unknown', so a real value is never clobbered
-- (e.g. by a later login from a different timezone).
--
-- Called from the client after login (AuthRedirect) and as a Dashboard-load
-- fallback so existing users get backfilled on their next visit.
-- Depends on the region column (13).

CREATE OR REPLACE FUNCTION public.set_my_region(p_region text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Must be authenticated, and ignore empty / unknown values.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  IF p_region IS NULL OR btrim(p_region) = '' OR p_region = 'Unknown' THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET region = p_region,
      updated_at = now()
  WHERE id = auth.uid()
    AND (region IS NULL OR region = 'Unknown');
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_region(text) TO authenticated;

COMMENT ON FUNCTION public.set_my_region(text) IS
  'Lets an authenticated user persist their own detected region (fills profiles.region only when empty/Unknown). Called by the client after login.';
