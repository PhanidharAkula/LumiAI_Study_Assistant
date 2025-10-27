-- QUICK FIX: Update all "Unknown" regions to a default value
-- This will immediately show proper regions in your admin dashboard

-- Step 1: Update all Unknown/NULL regions to Americas (or change to your region)
UPDATE public.profiles 
SET region = 'Americas'  -- Change this to: Europe, Asia, Africa, Oceania, etc.
WHERE region IS NULL OR region = 'Unknown';

-- Step 2: Verify the update worked
SELECT 
  region, 
  COUNT(*) as user_count
FROM public.profiles
GROUP BY region
ORDER BY user_count DESC;

-- Step 3: See all users with their updated regions
SELECT email, full_name, region, created_at
FROM public.profiles
ORDER BY created_at DESC
LIMIT 10;

-- Future: Users who log in will get auto-detected regions
-- But this fixes the immediate "Unknown" issue
