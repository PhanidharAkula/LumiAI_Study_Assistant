-- Helper script to populate region for existing users
-- Run this AFTER running 14_add_region_to_profiles.sql
-- This will set a default region for users who don't have one yet

-- Option 1: Set all existing NULL regions to a default value
-- Uncomment and modify the region value as needed
-- UPDATE public.profiles 
-- SET region = 'Americas'  -- Change this to your primary region
-- WHERE region IS NULL;

-- Option 2: Set different regions based on email domain (example)
-- UPDATE public.profiles 
-- SET region = CASE 
--   WHEN email LIKE '%@gmail.com' THEN 'Americas'
--   WHEN email LIKE '%@yahoo.com' THEN 'Americas'
--   WHEN email LIKE '%@outlook.com' THEN 'Europe'
--   ELSE 'Unknown'
-- END
-- WHERE region IS NULL;

-- Option 3: Keep as Unknown for manual review
-- This is the safest option - existing users keep "Unknown"
-- until they log in again and region is auto-detected
UPDATE public.profiles 
SET region = 'Unknown'
WHERE region IS NULL;

-- Check the results
SELECT 
  region, 
  COUNT(*) as user_count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM public.profiles), 2) as percentage
FROM public.profiles
GROUP BY region
ORDER BY user_count DESC;

-- View users with Unknown region
SELECT id, email, full_name, region, created_at
FROM public.profiles
WHERE region = 'Unknown'
ORDER BY created_at DESC;

-- Script complete
-- Note: This script sets region to 'Unknown' for existing users by default.
-- Existing users will get their region auto-detected when they log in again.
