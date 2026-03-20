export const config = { runtime: 'edge' };

import { jwtVerify } from 'jose';

export default async function handler(req, res) {
  const cookie = req.headers.cookie || '';
  const match  = cookie.match(/(?:^|;\s*)__session=([^;]+)/);

  if (!match) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    const secret  = new TextEncoder().encode(process.env.SESSION_SECRET);
    const { payload } = await jwtVerify(match[1], secret);
    return res.status(200).json({
      authenticated: true,
      email:   payload.email,
      name:    payload.name,
      picture: payload.picture,
    });
  } catch {
    return res.status(401).json({ authenticated: false });
  }
}
