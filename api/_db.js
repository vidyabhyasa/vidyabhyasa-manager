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
