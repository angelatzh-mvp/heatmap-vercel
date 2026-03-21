import { jwtVerify } from 'jose';
import { readSheet } from './sheets.js';

const SHEET_ID   = process.env.HEATMAP_SHEET_ID;
const SHEET_NAME = '產出結果';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  // Verify session
  const cookie = req.headers.cookie || '';
  const match  = cookie.match(/(?:^|;\s*)__session=([^;]+)/);
  if (!match) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
    await jwtVerify(match[1], secret);
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }

  try {
    const rows = await readSheet(SHEET_ID, SHEET_NAME);
    if (!rows || rows.length < 2) {
      return res.status(200).json({ headers: [], rows: [] });
    }
    const [headers, ...dataRows] = rows;
    return res.status(200).json({ headers, rows: dataRows });
  } catch (err) {
    console.error('Data fetch error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
