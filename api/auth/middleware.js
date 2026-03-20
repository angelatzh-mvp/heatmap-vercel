import { jwtVerify } from 'jose';

export const config = {
  matcher: [
    '/((?!login\\.html|unauthorized\\.html|api/|_next/|favicon).*)',
  ],
};

export const runtime = 'experimental-edge';

export default async function middleware(req) {
  const cookie = req.headers.get('cookie') || '';
  const match  = cookie.match(/(?:^|;\s*)__session=([^;]+)/);

  if (!match) {
    return Response.redirect(new URL('/login.html', req.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    await jwtVerify(match[1], secret);
    return;
  } catch {
    return Response.redirect(new URL('/login.html', req.url));
  }
}
