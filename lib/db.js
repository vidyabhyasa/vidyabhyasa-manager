import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL);

export function addMonths(dateStr, months){
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + Number(months));
  return d.toISOString().slice(0,10);
}

export function todayISO(){
  return new Date().toISOString().slice(0,10);
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
