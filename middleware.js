import { jwtVerify } from 'jose';

export const config = {
  matcher: ['/((?!login\\.html|unauthorized\\.html|api/|_next/|favicon).*)'],
};

export default async function middleware(req) {
  const url    = new URL(req.url);
  const cookie = req.headers.get('cookie') || '';
  const match  = cookie.match(/(?:^|;\s*)__session=([^;]+)/);

  if (!match) {
    return Response.redirect(new URL('/login.html', req.url));
  }

  let payload;
  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    ({ payload } = await jwtVerify(match[1], secret));
  } catch {
    return Response.redirect(new URL('/login.html', req.url));
  }

  // report.html is admin-only — redirect others to dashboard
  if (url.pathname === '/report.html') {
    if (payload.email !== process.env.REPORT_ADMIN_EMAIL) {
      return Response.redirect(new URL('/', req.url));
    }
  }

  return;
}
