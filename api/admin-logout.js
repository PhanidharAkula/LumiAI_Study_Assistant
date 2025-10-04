const cookie = require('cookie');

module.exports = async (req, res) => {
  res.setHeader('Set-Cookie', cookie.serialize('admin_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
    sameSite: 'lax'
  }));
  res.status(200).json({ ok: true });
};
