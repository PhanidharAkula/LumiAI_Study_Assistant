-- Global app settings + the admin-controlled "self-service account deletion" toggle.
-- Run this in the Supabase SQL editor.

-- 1) Key/value settings table. Everyone authenticated can read; only admins write.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read app settings" ON public.app_settings;
CREATE POLICY "read app settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admins write app settings" ON public.app_settings;
CREATE POLICY "admins write app settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- Default: self-service deletion enabled.
INSERT INTO public.app_settings (key, value)
VALUES ('account_deletion_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) Enforce the toggle server-side (can't be bypassed from the client), and
--    also clean up flashcard_history (added since the original function). With
--    the flag enabled (default) behaviour is unchanged.
CREATE OR REPLACE FUNCTION public.user_delete_own_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_id uuid := auth.uid();
  deletion_enabled boolean;
  user_email text;
BEGIN
  IF caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Respect the global toggle (default to enabled if unset).
  SELECT COALESCE((value #>> '{}')::boolean, true) INTO deletion_enabled
  FROM public.app_settings WHERE key = 'account_deletion_enabled';
  IF deletion_enabled IS false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_deletion_disabled');
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = caller_id;
  IF user_email IS NOT NULL THEN
    INSERT INTO public.deleted_accounts (email, deleted_by, deleted_at, can_reregister_at)
    VALUES (lower(user_email), caller_id, now(), now())
    ON CONFLICT (email) DO UPDATE
      SET deleted_at = now(), deleted_by = caller_id, can_reregister_at = now();
  END IF;

  DELETE FROM public.flashcard_history WHERE user_id = caller_id;
  DELETE FROM public.quiz_history WHERE user_id = caller_id;
  DELETE FROM public.conversations WHERE user_id = caller_id;
  DELETE FROM public.notes WHERE user_id = caller_id;
  DELETE FROM public.files WHERE user_id = caller_id;
  DELETE FROM public.classes WHERE user_id = caller_id;
  DELETE FROM public.profiles WHERE id = caller_id;

  BEGIN
    DELETE FROM auth.users WHERE id = caller_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', true, 'deleted_user_id', caller_id::text,
                              'auth_deleted', false, 'warning', SQLERRM);
  END;

  RETURN jsonb_build_object('ok', true, 'deleted_user_id', caller_id::text, 'auth_deleted', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
