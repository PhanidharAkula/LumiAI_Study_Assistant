-- Table to track deleted accounts and prevent immediate re-registration
-- This allows users to verify their account was deleted without auto-creating a new one

CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid, -- The user ID that was deleted
  can_reregister_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  reason text DEFAULT 'user_requested',
  CONSTRAINT email_lowercase CHECK (email = lower(email))
);

-- Index for fast email lookup
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_email ON public.deleted_accounts(email);
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_can_reregister_at ON public.deleted_accounts(can_reregister_at);

-- Enable RLS
ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can check their own deleted account status" ON public.deleted_accounts;
DROP POLICY IF EXISTS "System can insert deleted accounts" ON public.deleted_accounts;

-- Users can see if their email is in the deleted accounts table
CREATE POLICY "Users can check their own deleted account status"
  ON public.deleted_accounts
  FOR SELECT
  USING (email = lower(auth.jwt()->>'email'));

-- Only the system (SECURITY DEFINER functions) can insert
CREATE POLICY "System can insert deleted accounts"
  ON public.deleted_accounts
  FOR INSERT
  WITH CHECK (true);

-- Function to clean up old deleted account records (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_old_deleted_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete records older than the reregister date
  DELETE FROM public.deleted_accounts
  WHERE can_reregister_at < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON TABLE public.deleted_accounts IS 
'Tracks deleted accounts to prevent immediate re-registration and allow users to verify deletion';

COMMENT ON FUNCTION public.cleanup_old_deleted_accounts() IS 
'Removes old deleted account records after the grace period expires. Should be run periodically via cron or manually.';
