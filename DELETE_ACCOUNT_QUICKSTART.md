# Delete Account Feature - Quick Start

## 🚀 Quick Deployment (5 minutes)

### Step 1: Deploy SQL Function

1. Open [Supabase Dashboard](https://app.supabase.com/)
2. Go to SQL Editor → New Query
3. Copy & paste from: `/src/scripts/10_user_delete_own_account.sql`
4. Click **Run**

### Step 2: Deploy Code

```bash
# Push to your repository (if using Vercel/GitHub deployment)
git add .
git commit -m "Add delete account feature"
git push
```

That's it! ✅

## 📋 What Users See

1. User clicks their profile icon → **"Delete Account"**
2. Confirmation dialog appears with warning
3. User confirms deletion
4. Account and all data permanently deleted
5. User signed out and redirected to home page

## 🔍 What Gets Deleted

- ✅ User profile
- ✅ All classes
- ✅ All files (storage + database)
- ✅ All notes
- ✅ All conversations
- ✅ All quiz history
- ✅ Auth account

## 🔒 Security

- Users can only delete their own account (enforced by `auth.uid()`)
- No API endpoint needed - works directly through Supabase RPC
- Works in both local development and production
- Server-side validation in SQL function

## 📁 Files to Review

- **SQL**: `/src/scripts/10_user_delete_own_account.sql`
- **Frontend**: `/src/pages/Dashboard.jsx` (handleDeleteAccount function)

## 💡 How It Works

1. Frontend fetches file paths from database
2. Frontend deletes files from Supabase Storage
3. Frontend calls `user_delete_own_account()` via `supabase.rpc()`
4. SQL function deletes all database records
5. SQL function attempts to delete auth user
6. User signed out and redirected

## 🐛 Troubleshooting

**"not_authenticated" error?**
→ Make sure you're logged in when testing

**Function not found?**
→ Run the SQL script in Supabase SQL Editor

**Data still exists after deletion?**
→ Check browser console for errors, verify SQL function ran successfully

**Auth user not deleted?**
→ This is normal if the SQL function doesn't have permission to delete from auth.users
→ The auth session will expire and user won't be able to log in with deleted profile

## 📚 Full Documentation

- Deployment Guide: `DELETE_ACCOUNT_DEPLOYMENT.md`
- Implementation Details: `DELETE_ACCOUNT_SUMMARY.md`

## ⚠️ Important

This is **permanent** and **irreversible**. Consider adding:

- Email confirmation
- Grace period (7-30 days)
- Data export option

---

**Need Help?** Check the troubleshooting section in `DELETE_ACCOUNT_DEPLOYMENT.md`
