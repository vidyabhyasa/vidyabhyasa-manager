import { sql, addMonths, todayISO } from './_db.js';
import { requireStaff } from './_auth.js';

export default async function handler(req, res){
  const session = requireStaff(req, res);
  if (!session) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, action } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });

  if (action === 'remove'){
    await sql`
      update students set
        locker_id = null, locker_floor = null, locker_join_date = null,
        locker_months = null, locker_expiry_date = null, locker_deposit = null
      where id = ${studentId}`;
    return res.status(200).json({ ok: true });
  }

  const { lockerId, floorId, months, amount } = req.body || {};
  if (!lockerId || !floorId || !months || !amount) return res.status(400).json({ error: 'lockerId, floorId, months, and amount are required' });

  const taken = await sql`select 1 from students where locker_id = ${lockerId} and locker_expiry_date >= current_date limit 1`;
  if (taken.length) return res.status(409).json({ error: 'That locker was just taken. Please pick another.' });

  const today = todayISO();
  const lockerExpiry = addMonths(today, months);

  await sql`
    update students set
      locker_id = ${lockerId}, locker_floor = ${floorId}, locker_join_date = ${today},
      locker_months = ${months}, locker_expiry_date = ${lockerExpiry}, locker_deposit = 200
    where id = ${studentId}`;
  await sql`insert into payments (student_id, date, amount, note) values (${studentId}, ${today}, ${amount}, ${'Locker assigned — ' + lockerId + ' +' + months + 'mo'})`;

  res.status(200).json({ ok: true });
}
