import { jwtVerify } from 'jose';

export const config = {
  matcher: ['/((?!login|unauthorized|api/auth|_next|favicon).*)'],
};

export default async function middleware(req) {
  const url    = new URL(req.url);
  const cookie = req.headers.get('cookie') || '';
  const match  = cookie.match(/(?:^|;\s*)__session=([^;]+)/);

  // No session cookie → redirect to login
  if (!match) {
    return Response.redirect(new URL('/login.html', req.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    await jwtVerify(match[1], secret);
    // Valid session → allow through
    return;
  } catch {
    // Expired or invalid token → redirect to login
    return Response.redirect(new URL('/login.html', req.url));
  }
}
