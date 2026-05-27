-- Force update regions for all existing users to a default region
-- This is useful when you want to immediately populate regions
-- instead of waiting for users to log in again

-- OPTION 1: Set all to a single default region (RECOMMENDED)
-- Change 'Americas' to your primary user region
UPDATE public.profiles 
SET region = 'Americas'
WHERE region IS NULL OR region = 'Unknown';

-- OPTION 2: Set based on email domain patterns
-- UPDATE public.profiles 
-- SET region = CASE 
--   WHEN email LIKE '%@gmail.com' OR email LIKE '%@yahoo.com' THEN 'Americas'
--   WHEN email LIKE '%@gmail.co.uk' OR email LIKE '%@yahoo.co.uk' THEN 'Europe'
--   WHEN email LIKE '%@gmail.in' OR email LIKE '%@yahoo.co.in' THEN 'Asia'
--   WHEN email LIKE '%@gmail.com.au' THEN 'Oceania'
--   ELSE 'Americas'  -- Default fallback
-- END
-- WHERE region IS NULL OR region = 'Unknown';

-- OPTION 3: Keep some as Unknown and set others to default
-- UPDATE public.profiles 
-- SET region = 'Americas'
-- WHERE (region IS NULL OR region = 'Unknown') 
-- AND email NOT LIKE '%test%';  -- Keep test accounts as Unknown

-- Verify the changes
SELECT 
  region, 
  COUNT(*) as user_count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM public.profiles), 2) as percentage
FROM public.profiles
GROUP BY region
ORDER BY user_count DESC;

-- List all users with their regions
SELECT email, full_name, region, created_at
FROM public.profiles
ORDER BY created_at DESC
LIMIT 20;
