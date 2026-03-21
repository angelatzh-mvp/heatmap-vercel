import { jwtVerify } from 'jose';
import { readSheet } from './sheets.js';

const SHEET_ID    = process.env.TRACKING_SHEET_ID;
const SHEET_NAME  = 'events';
const ADMIN_EMAIL = process.env.REPORT_ADMIN_EMAIL;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  // Verify session
  const cookie = req.headers.cookie || '';
  const match  = cookie.match(/(?:^|;\s*)__session=([^;]+)/);
  if (!match) return res.status(401).json({ error: 'Unauthorized' });

  let payload;
  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    ({ payload } = await jwtVerify(match[1], secret));
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }

  // Admin-only
  if (payload.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const rows = await readSheet(SHEET_ID, SHEET_NAME);
    // rows[0] may be header or first data row — detect
    const dataRows = rows.filter(r => r[0] && r[0] !== 'timestamp');

    // Parse rows: [timestamp, email, name, event, brand, sessionId]
    const events = dataRows.map(r => ({
      timestamp: r[0] || '',
      email:     r[1] || '',
      name:      r[2] || '',
      event:     r[3] || '',
      brand:     r[4] || '',
      sessionId: r[5] || '',
    }));

    // Aggregate per user
    const userMap = {};
    events.forEach(e => {
      if (!userMap[e.email]) {
        userMap[e.email] = {
          email:      e.email,
          name:       e.name,
          logins:     0,
          brandViews: 0,
          brands:     new Set(),
          lastSeen:   e.timestamp,
          sessions:   new Set(),
        };
      }
      const u = userMap[e.email];
      if (e.timestamp > u.lastSeen) u.lastSeen = e.timestamp;
      if (e.event === 'login')       u.logins++;
      if (e.event === 'view_brand' && e.brand) {
        u.brandViews++;
        u.brands.add(e.brand);
      }
      if (e.sessionId) u.sessions.add(e.sessionId);
    });

    const users = Object.values(userMap).map(u => ({
      ...u,
      brands:   [...u.brands].sort(),
      sessions: u.sessions.size,
    })).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));

    // Summary stats
    const uniqueUsers   = users.length;
    const totalLogins   = events.filter(e => e.event === 'login').length;
    const totalBrandViews = events.filter(e => e.event === 'view_brand').length;
    const brandCount    = {};
    events.filter(e => e.event === 'view_brand' && e.brand).forEach(e => {
      brandCount[e.brand] = (brandCount[e.brand] || 0) + 1;
    });
    const topBrand = Object.entries(brandCount).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';

    // Recent activity (last 50)
    const recent = [...events].reverse().slice(0, 50);

    return res.status(200).json({
      summary: { uniqueUsers, totalLogins, totalBrandViews, topBrand },
      users,
      recent,
    });
  } catch (err) {
    console.error('Report error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
