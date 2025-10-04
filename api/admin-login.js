const crypto = require('crypto');
const cookie = require('cookie');

const signToken = (payload, secret) => {
  const payloadBase = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig = crypto.createHmac('sha256', secret).update(payloadBase).digest('base64');
  return `${payloadBase}.${sig}`;
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { username, password } = req.body || {};
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;

  if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !ADMIN_JWT_SECRET) {
    res.status(500).json({ error: 'Admin credentials not configured' });
    return;
  }

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const now = Math.floor(Date.now() / 1000);
    const payload = { iat: now, exp: now + 60 * 60 }; // 1 hour
    const token = signToken(payload, ADMIN_JWT_SECRET);

    res.setHeader('Set-Cookie', cookie.serialize('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60,
      path: '/',
      sameSite: 'lax'
    }));

    res.status(200).json({ ok: true });
    return;
  }

  res.status(401).json({ error: 'Invalid credentials' });
};
