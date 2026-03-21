// Shared Google Sheets helper
// Uses a Service Account JWT to authenticate with the Sheets API

async function getServiceAccountToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT env var missing');

  const sa = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));

  const now   = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  };

  // Build JWT manually (no external lib needed — RSA-SHA256 via Node crypto)
  const { createSign } = await import('crypto');
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
  const sign    = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(tokenData));
  return tokenData.access_token;
}

export async function appendRow(sheetId, sheetName, values) {
  const token = await getServiceAccountToken();
  const range = encodeURIComponent(`${sheetName}!A1`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [values] }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error('Sheets append error: ' + JSON.stringify(err));
  }
  return res.json();
}

export async function readSheet(sheetId, sheetName) {
  const token = await getServiceAccountToken();
  const range = encodeURIComponent(`${sheetName}!A:Z`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error('Sheets read error: ' + JSON.stringify(err));
  }
  const data = await res.json();
  return data.values || [];
}

export async function updateCell(sheetId, sheetName, rowIndex, colIndex, value) {
  // rowIndex and colIndex are 0-based; Sheets API uses 1-based rows and A1 notation
  const token  = await getServiceAccountToken();
  const col    = String.fromCharCode(65 + colIndex); // 0→A, 1→B, etc.
  const row    = rowIndex + 1;                        // 1-based
  const range  = encodeURIComponent(`${sheetName}!${col}${row}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [[value]] }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error('Sheets update error: ' + JSON.stringify(err));
  }
  return res.json();
}

export async function deleteOldRows(sheetId, sheetName, retentionDays = 180) {
  // Read all rows, find indices older than retentionDays, batch delete
  const token = await getServiceAccountToken();
  const rows  = await readSheet(sheetId, sheetName);
  if (rows.length <= 1) return; // only header or empty

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  // rows[0] is header, rows[1..] are data
  const toDelete = [];
  rows.slice(1).forEach((row, i) => {
    const ts = new Date(row[0]).getTime();
    if (!isNaN(ts) && ts < cutoff) toDelete.push(i + 1); // 1-indexed, skip header
  });
  if (toDelete.length === 0) return;

  // Build batchUpdate deleteDimension requests (from bottom to top to preserve indices)
  const requests = toDelete.reverse().map(rowIndex => ({
    deleteDimension: {
      range: {
        sheetId:    0, // assumes first sheet tab — will be overridden if needed
        dimension:  'ROWS',
        startIndex: rowIndex,
        endIndex:   rowIndex + 1,
      }
    }
  }));

  // Get actual sheetId (tab id) for the named sheet
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const meta = await metaRes.json();
  const tab  = meta.sheets?.find(s => s.properties.title === sheetName);
  const tabId = tab?.properties?.sheetId ?? 0;
  requests.forEach(r => { r.deleteDimension.range.sheetId = tabId; });

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
}
