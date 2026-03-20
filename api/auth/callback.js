import { SignJWT } from 'jose';

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/login.html?error=access_denied');
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri  = `${process.env.BASE_URL}/api/auth/callback`;
  const allowedDomain = process.env.ALLOWED_DOMAIN; // shopline.com

  // 1. Exchange code for tokens
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
    console.error('Token exchange failed:', err);
    return res.redirect('/login.html?error=token_failed');
  }

  // 2. Decode Google's ID token (JWT) — verify by fetching userinfo instead
  let userInfo;
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    userInfo = await userRes.json();
    if (!userInfo.email) throw new Error('No email returned');
  } catch (err) {
    console.error('Userinfo fetch failed:', err);
    return res.redirect('/login.html?error=userinfo_failed');
  }

  // 3. Domain check
  const emailDomain = userInfo.email.split('@')[1];
  if (emailDomain !== allowedDomain) {
    return res.redirect(`/unauthorized.html?email=${encodeURIComponent(userInfo.email)}`);
  }

  // 4. Create signed JWT session (24 hours)
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

  // 5. Set HttpOnly secure cookie
  const isProd = process.env.BASE_URL?.startsWith('https');
  res.setHeader('Set-Cookie',
    `__session=${sessionToken}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${isProd ? '; Secure' : ''}`
  );

  return res.redirect('/');
}
