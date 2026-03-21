import { jwtVerify } from 'jose';
import { readSheet, updateCell } from './sheets.js';

const SHEET_ID     = process.env.HEATMAP_SHEET_ID;
const ALLOWED_TABS = ['TW', 'HK'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

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

  const { country, handle, period, json } = req.body || {};

  if (!country || !handle || !period || !json) {
    return res.status(400).json({ error: 'Missing required fields: country, handle, period, json' });
  }
  if (!ALLOWED_TABS.includes(country)) {
    return res.status(400).json({ error: `Invalid country. Must be one of: ${ALLOWED_TABS.join(', ')}` });
  }

  try {
    const rows = await readSheet(SHEET_ID, country);
    if (!rows || rows.length < 2) {
      return res.status(404).json({ error: 'Sheet is empty or missing headers' });
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const handleCol    = headers.indexOf('handle');
    const periodCol    = headers.indexOf('period');
    const aiCol        = headers.indexOf('ai_response');

    if (handleCol === -1 || periodCol === -1) {
      return res.status(500).json({ error: 'Could not find handle or period column in sheet' });
    }
    if (aiCol === -1) {
      return res.status(500).json({ error: 'Could not find ai_response column in sheet' });
    }

    // Find the first data row matching handle + period (rows[0] is header → rowIndex 1-based offset)
    const matchIndex = rows.findIndex((row, i) => {
      if (i === 0) return false; // skip header
      return (row[handleCol] || '').trim() === handle.trim() &&
             (row[periodCol] || '').trim() === period.trim();
    });

    if (matchIndex === -1) {
      return res.status(404).json({ error: `No row found for handle="${handle}" period="${period}"` });
    }

    // matchIndex is already the actual array index (0-based); Sheets rows are 1-based
    await updateCell(SHEET_ID, country, matchIndex, aiCol, json);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Save AI error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
