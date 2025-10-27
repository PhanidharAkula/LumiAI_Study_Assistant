const fetch = require('node-fetch');

/**
 * API endpoint for users to delete their own account
 * This does NOT require admin privileges - any authenticated user can delete their own account
 */
module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Get the authorization header from the request
  const authHeader = req.headers.authorization || '';
  const userToken = authHeader.split(' ')[1];

  if (!userToken) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  try {
    // Step 1: Verify the user's token and get their user ID
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 
        Authorization: `Bearer ${userToken}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY
      },
    });

    if (!userRes.ok) {
      const errorText = await userRes.text();
      console.error('Failed to verify user token:', errorText);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = await userRes.json();
    const userId = user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Could not identify user' });
    }

    console.log(`User ${userId} is deleting their account`);

    // Step 2: Get all file paths for storage cleanup
    let filePaths = [];
    try {
      const filesRes = await fetch(
        `${SUPABASE_URL}/rest/v1/files?user_id=eq.${userId}&select=path`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );

      if (filesRes.ok) {
        const files = await filesRes.json();
        filePaths = files
          .map(f => f.path)
          .filter(path => path); // Filter out null/undefined paths
      }
    } catch (err) {
      console.error('Error fetching file paths:', err);
      // Continue with deletion even if we can't get file paths
    }

    // Step 3: Delete files from storage
    if (filePaths.length > 0) {
      try {
        const storageDeleteRes = await fetch(
          `${SUPABASE_URL}/storage/v1/object/files`,
          {
            method: 'DELETE',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prefixes: filePaths
            }),
          }
        );

        if (!storageDeleteRes.ok) {
          const errorText = await storageDeleteRes.text();
          console.error('Error deleting files from storage:', errorText);
          // Continue with account deletion even if storage cleanup fails
        } else {
          console.log(`Deleted ${filePaths.length} files from storage`);
        }
      } catch (err) {
        console.error('Error during storage cleanup:', err);
        // Continue with account deletion even if storage cleanup fails
      }
    }

    // Step 4: Call the SQL function to delete all user data from database tables
    try {
      const rpcRes = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/user_delete_own_account`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${userToken}`, // Use user's token so auth.uid() works
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );

      const rpcJson = await rpcRes.json().catch(() => null);
      
      if (!rpcRes.ok) {
        const details = rpcJson || (await rpcRes.text());
        console.error('user_delete_own_account RPC error:', details);
        return res.status(502).json({ 
          error: 'Failed to delete user data', 
          details 
        });
      }

      // Check the response from the SQL function
      const payload = Array.isArray(rpcJson) && rpcJson.length ? rpcJson[0] : rpcJson;
      if (payload && payload.ok === false) {
        console.error('user_delete_own_account function returned error:', payload);
        return res.status(502).json({ 
          error: 'Database deletion failed', 
          details: payload 
        });
      }

      console.log('Successfully deleted user data from database');
    } catch (rpcErr) {
      console.error('Error calling user_delete_own_account RPC:', rpcErr);
      return res.status(502).json({ 
        error: 'Error deleting user data', 
        details: String(rpcErr) 
      });
    }

    // Step 5: Delete the auth user using service role key
    try {
      const authDeleteRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
        {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        }
      );

      if (!authDeleteRes.ok) {
        const errText = await authDeleteRes.text();
        console.error('Failed to delete auth user:', errText);
        // User data is already deleted, so we return a partial success
        return res.status(207).json({ 
          ok: true,
          warning: 'User data deleted but auth user deletion failed',
          details: errText 
        });
      }

      console.log(`Successfully deleted auth user ${userId}`);
    } catch (authErr) {
      console.error('Error deleting auth user:', authErr);
      // User data is already deleted, so we return a partial success
      return res.status(207).json({ 
        ok: true,
        warning: 'User data deleted but auth user deletion encountered an error',
        details: String(authErr)
      });
    }

    // Step 6: Success - everything deleted
    res.status(200).json({ 
      ok: true, 
      message: 'Account successfully deleted',
      filesDeleted: filePaths.length
    });

  } catch (error) {
    console.error('Unexpected error during account deletion:', error);
    res.status(500).json({ 
      error: 'Failed to delete account', 
      details: error.message 
    });
  }
};
