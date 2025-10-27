# Delete Account Verification Feature

## Problem Solved

**Issue**: When users delete their account and try to log back in with Google OAuth to verify deletion, a new account is automatically created - making it impossible to confirm the deletion worked.

**Solution**: Track deleted accounts for 7 days and show confirmation message when they try to log in, then prevent re-registration during cooldown period.

## How It Works

### User Flow:

1. **User deletes account**

   - All data is removed (classes, files, notes, etc.)
   - Email is recorded in `deleted_accounts` table with 7-day cooldown
   - User is signed out

2. **User tries to log back in to verify**

   - Google OAuth authenticates them
   - Dashboard checks `deleted_accounts` table
   - **Shows confirmation message**:

     ```
     ✅ Account Deletion Confirmed

     Your account was successfully deleted on [date].

     Your data has been permanently removed from our servers.

     You can create a new account after [date] if you wish to return.
     ```

   - User is immediately signed out
   - **No profile is created** (prevented by trigger)

3. **After 7 days**
   - Email is removed from `deleted_accounts` (manual cleanup or cron)
   - User can create fresh account if desired

## Deployment Steps

### Step 1: Create deleted_accounts table

Run in Supabase SQL Editor:

```sql
-- Copy from /src/scripts/11_deleted_accounts_table.sql
```

### Step 2: Update user_delete_own_account function

Run in Supabase SQL Editor:

```sql
-- Copy from /src/scripts/10_user_delete_own_account.sql
```

### Step 3: Update handle_new_user_safe function

Run in Supabase SQL Editor:

```sql
-- Copy from /src/scripts/06_handle_new_user_safe.sql
```

### Step 4: Deploy frontend code

The Dashboard.jsx changes are already in place - just push:

```bash
git add .
git commit -m "Add delete account verification feature"
git push
```

## Database Schema

### deleted_accounts table

```sql
- id: uuid (primary key)
- email: text (unique, lowercase)
- deleted_at: timestamptz
- deleted_by: uuid (the deleted user's ID)
- can_reregister_at: timestamptz (deleted_at + 7 days)
- reason: text ('user_requested')
```

### Benefits

1. **User Verification**: Users can confirm their account was deleted
2. **Prevent Accidents**: 7-day cooldown prevents accidental re-registration
3. **Clear Communication**: Shows exact deletion date and when they can return
4. **Data Safety**: No profile created during cooldown = no data confusion

## Maintenance

### Cleanup Old Records

Run periodically (monthly) in Supabase SQL Editor:

```sql
SELECT public.cleanup_old_deleted_accounts();
```

Or set up a Supabase Edge Function cron job:

```sql
SELECT cron.schedule(
  'cleanup-deleted-accounts',
  '0 0 * * 0',  -- Every Sunday at midnight
  $$SELECT public.cleanup_old_deleted_accounts()$$
);
```

## Customization

### Change Cooldown Period

In `10_user_delete_own_account.sql`:

```sql
-- Change from 7 days to your preferred duration
can_reregister_at = now() + interval '30 days'  -- 30 days instead of 7
```

### Change Confirmation Message

In `Dashboard.jsx`:

```javascript
alert(
  `Your custom message here...\n` +
    `Deleted on ${deletedDate}.\n` +
    `Can return after ${canReregisterDate}.`
);
```

## Testing

1. **Delete an account**

   - Log in with Google
   - Delete account via profile menu
   - Note the email used

2. **Verify deletion message**

   - Try to log in again with same Google account
   - Should see confirmation message
   - Should be immediately signed out
   - Dashboard should NOT be accessible

3. **Check database**

   ```sql
   SELECT * FROM public.deleted_accounts WHERE email = 'test@example.com';
   ```

   Should show the deletion record

4. **Test re-registration after cooldown**
   ```sql
   -- Manually expire the cooldown for testing
   UPDATE public.deleted_accounts
   SET can_reregister_at = now() - interval '1 day'
   WHERE email = 'test@example.com';
   ```
   - Log in again - should create new account successfully

## Security

- ✅ RLS enabled on `deleted_accounts` table
- ✅ Users can only see their own deleted account status
- ✅ Only SECURITY DEFINER functions can insert records
- ✅ Email stored as lowercase for consistency
- ✅ No PII stored except email (which is needed for verification)

## Troubleshooting

### User sees blank dashboard instead of message

- Check if `deleted_accounts` table exists
- Verify email is in lowercase
- Check RLS policies are enabled

### New profile still created during cooldown

- Verify `handle_new_user_safe` function was updated
- Check `auth_error_log` table for blocked attempts

### Message not showing

- Check browser console for errors
- Verify Dashboard.jsx includes the deleted account check
- Ensure date comparison is working (timezone issues)

## Alternative: Instant Block (No Auth Creation)

If you want to block authentication completely instead of showing a message, you can use a Supabase Auth Hook (Enterprise feature) or manually delete auth users during cooldown from admin panel.

Current implementation allows auth but blocks profile creation, which is simpler and works on all Supabase plans.
