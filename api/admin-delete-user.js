const fetch = require('node-fetch');

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

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    // First: call the admin_delete_user SQL function via the REST RPC endpoint
    try {
      const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_delete_user`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_user_id: id }),
      });

      const rpcJson = await rpcRes.json().catch(() => null);
      if (!rpcRes.ok) {
        const details = rpcJson || (await rpcRes.text());
        console.error('admin_delete_user RPC error:', details);
        return res.status(502).json({ error: 'admin_delete_user RPC error', details });
      }

      // normalize payload (could be array or object)
      const payload = Array.isArray(rpcJson) && rpcJson.length ? rpcJson[0] : rpcJson;
      if (payload && payload.ok === false) {
        console.error('admin_delete_user function returned error:', payload);
        return res.status(502).json({ error: 'admin_delete_user failed', details: payload });
      }
    } catch (rpcErr) {
      console.error('Error calling admin_delete_user RPC:', rpcErr);
      return res.status(502).json({ error: 'Error calling admin_delete_user RPC', details: String(rpcErr) });
    }

    // Second: delete the auth user row via the admin endpoint
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error('Supabase delete user error:', errText);
      // Return 502 but indicate that app data deletion may have succeeded
      return res.status(502).json({ error: 'Supabase delete user error', details: errText, note: 'app data/profile may have been removed' });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};
