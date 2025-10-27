# 🧪 TESTING MODE - DELETE ACCOUNT FEATURE

## Current Status: TESTING MODE (No 7-day cooldown)

### What's Changed for Testing:

- ✅ 7-day cooldown period is **DISABLED** (set to 0 seconds)
- ✅ Users can immediately re-register after deleting their account
- ✅ You can test the delete flow multiple times quickly

---

## 📍 WHERE TO RE-ENABLE 7-DAY COOLDOWN FOR PRODUCTION:

### File: `/src/scripts/10_user_delete_own_account.sql`

**Lines 30 and 35** - Change both instances from:

```sql
now() + interval '0 seconds'  -- TESTING: Set to '7 days' for production
```

**Back to:**

```sql
now() + interval '7 days'  -- 7 day cooldown period
```

---

## 🚀 Steps to Push to Production:

### 1. **Update the SQL File**

- Open `/src/scripts/10_user_delete_own_account.sql`
- Find lines with `interval '0 seconds'` (there are 2 of them)
- Change both to `interval '7 days'`
- Save the file

### 2. **Run the Updated SQL in Supabase**

- Go to your Supabase Dashboard
- Navigate to SQL Editor
- Copy the ENTIRE content of `10_user_delete_own_account.sql`
- Paste and run it in the SQL Editor
- This will recreate the function with the 7-day cooldown

### 3. **Verify the Change**

- Delete a test account
- Try to log back in immediately
- You should see the cooldown message showing 7 days from now

### 4. **Commit and Push**

```bash
git add src/scripts/10_user_delete_own_account.sql
git commit -m "Enable 7-day cooldown for account deletion"
git push
```

---

## ⚠️ IMPORTANT REMINDERS:

- **TESTING MODE is currently active** - No cooldown period
- **Before deploying to production**: Change back to 7 days
- **After changing the SQL file**: You MUST run it in Supabase SQL Editor
- **Don't forget**: Update both INSERT and UPDATE statements (2 places)

---

## 🔍 Quick Search:

Search for: `interval '0 seconds'` in the codebase to find testing mode settings
Replace with: `interval '7 days'` before production deployment

---

**Last Updated:** October 25, 2025
**Status:** 🧪 TESTING MODE ACTIVE
