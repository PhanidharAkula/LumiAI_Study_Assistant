# Quick Start Guide - Admin Region & Filters

## Step 1: Run SQL Scripts (REQUIRED)

Open Supabase SQL Editor and run these scripts **in order**:

### Script 1: Add Region Column

```bash
# File: src/scripts/14_add_region_to_profiles.sql
```

This adds the `region` column to the profiles table and updates the trigger.

### Script 2: Update Admin Stats Function

```bash
# File: src/scripts/12_admin_get_user_stats.sql
```

This updates the admin function to return region and created_at data.

## Step 2: Test the Features

### On Desktop

1. Navigate to `/admin` (must be logged in as admin)
2. **Summary Cards**: Should show 4 cards (Users, Storage, Classes, Files)
3. **Search Bar**: Type to filter users by name or email
4. **Region Filter**: Dropdown should show unique regions
5. **Date Filter**: Filter by Today, Week, Month, Year, All Time
6. **User Cards**: Should show region 📍 and join date 📅
7. **Clear Filters**: Click to reset all filters

### On Mobile (or DevTools)

1. Open Chrome DevTools (F12)
2. Toggle Device Toolbar (Ctrl+Shift+M / Cmd+Shift+M)
3. Select a mobile device (iPhone, iPad, etc.)
4. Navigate to `/admin`
5. **Summary Cards**: Should show 2 columns on mobile, 1 on very small screens
6. **Filters**: Should stack vertically
7. **User Cards**: Should stack with avatar on top, delete button full-width
8. **Text**: Should be smaller and more readable

### Test New User Signup

1. **Sign out** from current account
2. **Clear cookies** for clean test
3. **Sign up** with a new Google account (or use incognito mode)
4. After signup, go to **Admin page**
5. Find the new user and verify:
   - Region is detected (not "Unknown")
   - Join date is today's date

## Step 3: Verify Database

Run in Supabase SQL Editor:

```sql
-- Check region column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'region';

-- View sample data
SELECT id, email, full_name, region, created_at
FROM profiles
LIMIT 5;

-- Test admin function
SELECT user_id, email, region, created_at
FROM admin_get_user_stats()
LIMIT 5;
```

## Common Issues & Fixes

### Issue: "Function does not exist"

**Fix**: Run the SQL scripts in Supabase SQL Editor

### Issue: Region shows "Unknown" for all users

**Fix**:

1. Existing users need to log in again for region to update
2. Or manually update: `UPDATE profiles SET region = 'Americas' WHERE region IS NULL;`

### Issue: Filters not working

**Fix**:

1. Check browser console for errors
2. Ensure `regionFilter` and `dateFilter` state are initialized
3. Clear browser cache

### Issue: Mobile layout not responsive

**Fix**:

1. Ensure `Admin.css` is imported in `Admin.jsx`
2. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
3. Check DevTools for CSS conflicts

### Issue: "Access denied" on admin page

**Fix**:

1. Verify `is_admin` is `true` in profiles table
2. Run: `UPDATE profiles SET is_admin = true WHERE email = 'your@email.com';`

## Expected Results

### Desktop View

```
┌─────────────────── Admin Dashboard ───────────────────┐
│                                                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                │
│  │Users │ │Storage│ │Classes│ │Files│                 │
│  │  5   │ │ 2.3GB│ │  12   │ │  48 │                │
│  └──────┘ └──────┘ └──────┘ └──────┘                │
│                                                        │
│  [Search users by name or email...        🔍]        │
│                                                        │
│  [Region: All ▼]  [Join Date: All Time ▼]           │
│  Showing 5 of 5 users  [Clear Filters]               │
│                                                        │
│  ┌────────────────────────────────────────────┐      │
│  │ 👤  John Doe  john@example.com             │      │
│  │     2 classes • 5 files • 100 MB           │      │
│  │     📍 Americas • 📅 Joined Oct 20, 2025   │ [❌]│
│  └────────────────────────────────────────────┘      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Mobile View

```
┌──────── Admin ────────┐
│                        │
│  ┌──────┐ ┌──────┐   │
│  │Users │ │Storage│   │
│  │  5   │ │ 2.3GB│   │
│  └──────┘ └──────┘   │
│  ┌──────┐ ┌──────┐   │
│  │Classes│ │Files│    │
│  │  12   │ │  48 │   │
│  └──────┘ └──────┘   │
│                        │
│  [Search...     🔍]   │
│                        │
│  [Region: All ▼]      │
│  [Date: All Time ▼]   │
│                        │
│  ┌──────────────────┐ │
│  │ 👤  John Doe     │ │
│  │ john@example.com │ │
│  │ 2 classes • 5... │ │
│  │ 📍 Americas      │ │
│  │ 📅 Oct 20, 2025  │ │
│  │ [Delete ❌]      │ │
│  └──────────────────┘ │
└────────────────────────┘
```

## Next Steps After Testing

1. ✅ Verify all filters work correctly
2. ✅ Test on actual mobile device (not just DevTools)
3. ✅ Check print preview looks good
4. ✅ Test with 10+ users for realistic data
5. ✅ Update region for existing users
6. ✅ Deploy to production
7. ✅ Monitor for errors in Supabase logs

## Region Options

Detected regions based on timezone:

- **Americas** - North & South America
- **Europe** - European countries
- **Asia** - Asian countries
- **Africa** - African countries
- **Oceania** - Australia, Pacific islands
- **Atlantic** - Atlantic islands
- **Indian Ocean** - Indian Ocean region
- **Unknown** - Could not detect (fallback)

## Date Filter Options

- **All Time** - No date filtering
- **Today** - Last 24 hours
- **Last 7 Days** - Last week
- **Last 30 Days** - Last month
- **Last Year** - Last 365 days

---

**Need Help?** Check the detailed summary in `ADMIN_REGION_FILTERS_SUMMARY.md`
