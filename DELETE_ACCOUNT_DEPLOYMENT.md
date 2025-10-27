# Delete Account Feature - Deployment Guide

This guide explains how to deploy the delete account feature for your LumiAI application.

## Overview

The delete account feature allows users to permanently delete their own accounts and all associated data. This includes:

- User profile
- All classes
- All files (metadata and storage)
- All notes
- All conversations
- All quiz history
- Auth user record

## Files Created/Modified

### New Files:

1. **`/src/scripts/10_user_delete_own_account.sql`** - SQL function for database cleanup and auth user deletion

### Modified Files:

1. **`/src/pages/Dashboard.jsx`** - Updated to use Supabase RPC to call the delete function directly

## Deployment Steps

### Step 1: Deploy the SQL Function

1. Log in to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy the contents of `/src/scripts/10_user_delete_own_account.sql`
6. Paste it into the SQL Editor
7. Click **Run** to execute the query
8. You should see a success message confirming the function was created

### Step 2: Verify the Function

Run this query in the SQL Editor to verify the function exists:

```sql
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'user_delete_own_account';
```

You should see one row returned with the function name.

### Step 3: Deploy the Code

Push your changes to your repository. If using Vercel or similar platforms, the deployment will happen automatically.

```bash
git add .
git commit -m "Add delete account feature"
git push
```

### Step 4: Verify the Feature Works

1. Log in to your application as a regular user (not admin)
2. Click on your profile menu in the top right
3. Click "Delete Account"
4. Confirm the deletion in the dialog
5. Your account data should be deleted and you should be redirected to the login page
6. Try logging in with the same credentials - it should fail (if auth user was deleted) or show no data

## How It Works

### User Flow:

1. User clicks "Delete Account" in the profile menu
2. A confirmation dialog appears warning about permanent deletion
3. Upon confirmation:
   - Frontend fetches all file paths from the database
   - Frontend deletes files from Supabase Storage
   - Frontend calls the SQL function `user_delete_own_account()` via Supabase RPC
   - SQL function deletes all user data from database tables
   - SQL function attempts to delete the auth user record
   - User is signed out and redirected to home page

### Security:

- Users can only delete their own accounts (verified by auth token)
- No admin privileges required
- SQL function uses `auth.uid()` to ensure caller can only delete their own data
- Service role key is only used server-side in the API endpoint

## Troubleshooting

### Function not found error

- Make sure you ran the SQL script in Step 1
- Verify the function exists using the verification query in Step 2
- Check that you're using the correct Supabase project

### Permission denied error

- Ensure your `SUPABASE_SERVICE_ROLE_KEY` is set correctly in your environment variables
- Verify the service role key has admin permissions

### Files not deleted from storage

- Check that the storage bucket name is correct (`files`)
- Verify the storage policies allow deletion
- Check the API logs for any storage-related errors

### User can still log in after deletion

- Check that the auth user was actually deleted (Step 5 of the API endpoint)
- Clear browser cache and cookies
- Try logging in with the same credentials - you should get an "Invalid credentials" error

## Rollback

If you need to remove this feature:

1. Remove the SQL function:

```sql
DROP FUNCTION IF EXISTS public.user_delete_own_account();
```

2. Revert the changes to Dashboard.jsx (restore the "coming soon" message)

3. Remove the `/api/delete-account.js` file

## Notes

- This is a **permanent** and **irreversible** action
- All user data is completely removed from the database
- Files are removed from storage
- There is no "soft delete" or recovery option
- Consider adding a grace period or email confirmation for production use
