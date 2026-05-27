-- One-off backfill: give pre-existing users a region placeholder.
--
-- New users now get their region captured automatically on login (set_my_region,
-- 15), so this is only for users created before that mechanism existed. Setting
-- them to 'Unknown' is neutral: the next time each user logs in, set_my_region
-- replaces 'Unknown' with their real detected region.
--
-- (Consolidates the old 15_populate_existing_user_regions + 16_force_update_regions,
-- which set everything to 'Unknown' and then overwrote it with a hard-coded
-- 'Americas' — losing real signal. This keeps the placeholder neutral instead.)

UPDATE public.profiles
SET region = 'Unknown'
WHERE region IS NULL;

-- Quick distribution check after running:
SELECT region, COUNT(*) AS user_count
FROM public.profiles
GROUP BY region
ORDER BY user_count DESC;
