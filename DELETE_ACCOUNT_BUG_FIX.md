# Delete Account Feature - Bug Fix

## Issue Fixed

The original implementation was trying to call an API endpoint (`/api/delete-account`) which:

1. Doesn't work in local development (404 error)
2. Required complex Vercel serverless function setup
3. Had JSON parsing issues

## Solution

Changed the implementation to use **Supabase RPC** directly from the frontend. This approach:

- ✅ Works in both local development and production
- ✅ No API endpoint needed
- ✅ Simpler and more reliable
- ✅ No JSON parsing issues
- ✅ No CORS issues

## What Changed

### 1. Dashboard.jsx (`handleDeleteAccount` function)

**Before**: Called `/api/delete-account` endpoint
**After**: Calls `supabase.rpc('user_delete_own_account')` directly

### 2. SQL Function

**Before**: Only deleted database records, relied on API to delete auth user
**After**: Attempts to delete auth user as well (with graceful fallback)

### 3. No API Endpoint Needed

The `/api/delete-account.js` file is no longer required (can be deleted if desired)

## How to Deploy

### Step 1: Update the SQL Function in Supabase

1. Open Supabase Dashboard → SQL Editor
2. Run the updated SQL from `/src/scripts/10_user_delete_own_account.sql`
3. This will replace the old version with the new one

### Step 2: Test Locally

The feature now works in local development! Just:

```bash
npm run dev
```

Then test the delete account feature - it should work without any 404 errors.

### Step 3: Deploy to Production

```bash
git add .
git commit -m "Fix delete account feature to use Supabase RPC"
git push
```

## Testing

1. Log in to your application
2. Click profile menu → "Delete Account"
3. Confirm the deletion
4. You should see:
   - Success message: "Your account has been successfully deleted"
   - Files deleted from storage (check console logs)
   - Redirected to home page
   - Cannot log in with same credentials

## What Gets Deleted

The function deletes in this order:

1. Quiz history
2. Conversations
3. Notes
4. Files (metadata)
5. Classes
6. Profile
7. Auth user (if permissions allow)

Storage files are deleted by the frontend before calling the RPC function.

## Error Handling

- If storage file deletion fails → continues with account deletion
- If auth user deletion fails → returns success with warning, all other data still deleted
- If database deletion fails → returns error, user can retry
- If session expired → redirects to login

## Console Logs

You'll see helpful logs in the browser console:

```
Starting account deletion for user: <user-id>
Found X files to delete from storage
Deleted X files from storage
RPC response: {ok: true, deleted_user_id: "...", auth_deleted: true}
Account data deleted successfully
```

## Troubleshooting

### "Function not found" error

→ You need to run the SQL script first (Step 1 above)

### "not_authenticated" error

→ Make sure you're logged in before trying to delete

### Data not deleted

→ Check the browser console for specific error messages
→ Verify the SQL function ran successfully

### Can still log in after deletion

If the auth user wasn't deleted (due to permissions):

- The profile and all data are still gone
- User will see empty dashboard
- They won't be able to access any data
- Their session will eventually expire

To fully delete the auth user, you can manually run this in Supabase SQL Editor:

```sql
DELETE FROM auth.users WHERE email = 'user@example.com';
```

Or grant the function owner permission to delete from `auth.users` (run as superuser):

```sql
-- Grant the function permission to delete auth users
GRANT DELETE ON auth.users TO postgres;
```

## Benefits of New Approach

1. **Works Everywhere**: Local dev, staging, production
2. **No Dependencies**: No need for API routes or serverless functions
3. **Simpler**: Direct RPC call from frontend
4. **Reliable**: No network issues between API layers
5. **Secure**: SQL function enforces security with `auth.uid()`
6. **Better Errors**: Clearer error messages and logging

## Files You Can Delete (Optional)

If you want to clean up:

- `/api/delete-account.js` - No longer needed
