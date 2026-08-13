import { sql, toDateStr } from '../lib/db.js';
import { getSession } from '../lib/auth.js';

// Triggered by Vercel Cron (see vercel.json) with an Authorization:
// Bearer $CRON_SECRET header that Vercel adds automatically when
// CRON_SECRET is set as an env var. Also allows a logged-in founder
// to trigger it manually (useful for testing without waiting for
// the nightly schedule).
function isAuthorized(req){
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  const session = getSession(req);
  return !!(session && session.role === 'founder');
}

function daysOverdue(dateStr, today){
  const t = new Date(today);
  const target = new Date(dateStr);
  return Math.round((t - target) / 86400000);
}

export default async function handler(req, res){
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Not authorized' });

  try{
    const today = new Date().toISOString().slice(0,10);
    const removedStudents = [];
    const clearedLockers = [];

    // Case A: seat itself is 3+ days overdue → remove the whole student.
    const seatOverdue = await sql`select * from students`;
    for (const s of seatOverdue){
      const expiryDate = toDateStr(s.expiry_date);
      if (daysOverdue(expiryDate, today) < 3) continue;

      await sql`insert into cleanup_flags (resource_type, resource_id, floor, reason)
                 values ('seat', ${s.seat_id}, ${s.floor}, 'auto-removed after 3 days overdue')`;
      if (s.locker_id){
        await sql`insert into cleanup_flags (resource_type, resource_id, floor, reason)
                   values ('locker', ${s.locker_id}, ${s.locker_floor}, 'auto-removed after 3 days overdue')`;
      }
      await sql`delete from students where id = ${s.id}`;
      removedStudents.push({ studentId: s.id, name: s.name, seatId: s.seat_id, lockerId: s.locker_id });
    }

    // Case B: locker independently 3+ days overdue, but seat is fine
    // (students removed in Case A already had their locker cleared
    // implicitly, so this only catches locker-only overdue cases).
    const lockerCandidates = await sql`select * from students where locker_id is not null`;
    for (const s of lockerCandidates){
      if (!s.locker_expiry_date) continue;
      const lockerExpiry = toDateStr(s.locker_expiry_date);
      if (daysOverdue(lockerExpiry, today) < 3) continue;

      await sql`insert into cleanup_flags (resource_type, resource_id, floor, reason)
                 values ('locker', ${s.locker_id}, ${s.locker_floor}, 'auto-removed after 3 days overdue')`;
      await sql`
        update students set
          locker_id = null, locker_floor = null, locker_join_date = null,
          locker_months = null, locker_expiry_date = null, locker_deposit = null
        where id = ${s.id}`;
      clearedLockers.push({ studentId: s.id, name: s.name, lockerId: s.locker_id });
    }

    res.status(200).json({ ok: true, removedStudents, clearedLockers, ranAt: new Date().toISOString() });
  }catch(err){
    console.error('cron-cleanup error:', err);
    res.status(500).json({ error: err.message || 'Server error running cleanup' });
  }
}
