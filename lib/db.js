import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL);

// Same day-of-month N months later; clamps to the month's last day
// (31 Jan + 1 month = 28 Feb) instead of spilling into the next month.
export function addMonths(dateStr, months){
  const [y, m, day] = String(dateStr).slice(0,10).split('-').map(Number);
  const total = (m - 1) + Number(months);
  const ty = y + Math.floor(total / 12);
  const tm = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(day, lastDay))).toISOString().slice(0,10);
}

export function addDays(dateStr, days){
  const d = new Date(String(dateStr).slice(0,10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0,10);
}

// Last day of a subscription that starts on `startDate`, inclusive:
// start 15 Oct + 1 month => ends 14 Nov (not 15 Nov).
export function periodEnd(startDate, months){
  return addDays(addMonths(startDate, months), -1);
}

// All "today" logic uses India time (IST), not UTC, so dates roll over at
// midnight in India rather than 5:30 AM.
export function todayISO(){
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Postgres bytea columns can come back from different drivers/configs
// as a real Buffer/Uint8Array, as Postgres's hex text format
// ("\x89504e47..."), or as a JSON-shaped {type:'Buffer',data:[...]}
// after passing through certain serialization paths. Normalize all
// of these to a real Buffer before sending image bytes to a client —
// otherwise the response looks fine (200 OK, right Content-Type) but
// the bytes themselves are garbage and the image fails to render.
export function toImageBuffer(v){
  if (!v) return null;
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (v && typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) return Buffer.from(v.data);
  if (typeof v === 'string'){
    if (v.startsWith('\\x')) return Buffer.from(v.slice(2), 'hex');
    // Some driver paths could return the hex text without the leading
    // \x marker. Real base64 image data almost always contains a
    // character outside 0-9a-f within the first few bytes (base64's
    // alphabet is much wider than hex's), so "looks like pure hex,
    // even length" reliably tells the two apart without relying on
    // the prefix being present.
    if (v.length > 16 && v.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(v)) return Buffer.from(v, 'hex');
    return Buffer.from(v, 'base64');
  }
  return Buffer.from(v);
}

// Neon can return `date` columns as JS Date objects or as strings
// depending on context — normalize to a plain 'YYYY-MM-DD' string
// so date math and comparisons behave consistently either way.
export function toDateStr(v){
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0,10);
  return String(v).slice(0,10);
}
