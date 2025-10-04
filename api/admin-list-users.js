const fetch = require('node-fetch');

// Verify admin by requiring an Authorization: Bearer <access_token> header.
// We validate the access token with Supabase and then check public.profiles.is_admin
// using the service role key.
const verifyAdmin = async (req) => {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.split(' ')[1];
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!bearer || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;

  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (!userRes.ok) return false;
    const user = await userRes.json();
    const userId = user?.id;
    if (!userId) return false;

    const profilesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=is_admin`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!profilesRes.ok) return false;
    const profiles = await profilesRes.json();
    return Array.isArray(profiles) && profiles[0] && profiles[0].is_admin === true;
  } catch (err) {
    console.error('verifyAdmin error:', err);
    return false;
  }
};

module.exports = async (req, res) => {
  if (!(await verifyAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_auth_users`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    if (!r.ok) {
      const text = await r.text();
      console.error('Supabase rpc error:', text);
      return res.status(502).json({ error: 'Supabase rpc error', details: text });
    }
    const data = await r.json();
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};
