import { SignJWT } from 'jose';
import { appendRow } from '../sheets.js';

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/login.html?error=access_denied');
  }

  const clientId      = process.env.GOOGLE_CLIENT_ID;
  const clientSecret  = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri   = `${process.env.BASE_URL}/api/auth/callback`;
  const allowedDomain = process.env.ALLOWED_DOMAIN;

  let tokens;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });
    tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);
  } catch (err) {
    return res.redirect('/login.html?error=token_failed');
  }

  let userInfo;
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    userInfo = await userRes.json();
    if (!userInfo.email) throw new Error('No email returned');
  } catch (err) {
    return res.redirect('/login.html?error=userinfo_failed');
  }

  const emailDomain = userInfo.email.split('@')[1];
  if (emailDomain !== allowedDomain) {
    return res.redirect(`/unauthorized.html?email=${encodeURIComponent(userInfo.email)}`);
  }

  const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
  const sessionToken = await new SignJWT({
    email:   userInfo.email,
    name:    userInfo.name,
    picture: userInfo.picture,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);

  const isProd = process.env.BASE_URL?.startsWith('https');
  res.setHeader('Set-Cookie',
    `__session=${sessionToken}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${isProd ? '; Secure' : ''}`
  );

  // Track login event (fire-and-forget — don't block redirect)
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const sessionId = sessionToken.slice(-8);
  appendRow(process.env.TRACKING_SHEET_ID, 'events', [
    timestamp, userInfo.email, userInfo.name || '', 'login', '', sessionId,
  ]).catch(err => console.error('Track login error:', err.message));

  return res.redirect('/');
}
