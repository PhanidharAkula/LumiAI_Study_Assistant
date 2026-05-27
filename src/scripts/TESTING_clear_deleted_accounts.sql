-- ⚠️ TESTING ONLY - Clear all deleted account records
-- This allows immediate re-registration for all previously deleted accounts
-- Run this in Supabase SQL Editor AFTER updating the user_delete_own_account function

-- Clear all deleted account records
DELETE FROM public.deleted_accounts;

-- Verify it's empty
SELECT COUNT(*) as remaining_records FROM public.deleted_accounts;

-- This will return 0 if all records are cleared
