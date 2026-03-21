import { jwtVerify } from 'jose';
import { appendRow, deleteOldRows } from './sheets.js';

const SHEET_ID   = process.env.TRACKING_SHEET_ID;
const SHEET_NAME = 'events';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

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

  const { event, brand } = req.body || {};
  if (!event) return res.status(400).json({ error: 'Missing event' });

  const timestamp  = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const sessionId  = match[1].slice(-8); // last 8 chars of JWT as session ref

  try {
    await appendRow(SHEET_ID, SHEET_NAME, [
      timestamp,
      payload.email,
      payload.name || '',
      event,
      brand || '',
      sessionId,
    ]);

    // Occasionally prune old rows (1-in-20 chance to avoid slowing every request)
    if (Math.random() < 0.05) {
      deleteOldRows(SHEET_ID, SHEET_NAME, 180).catch(() => {});
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Track error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
