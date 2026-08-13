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

// Neon can return `date` columns as JS Date objects or as strings
// depending on context — normalize to a plain 'YYYY-MM-DD' string
// so date math and comparisons behave consistently either way.
export function toDateStr(v){
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0,10);
  return String(v).slice(0,10);
}
