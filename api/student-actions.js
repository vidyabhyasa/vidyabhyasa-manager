import { sql, addMonths, todayISO, toDateStr } from '../lib/db.js';
import { requireStaff } from '../lib/auth.js';

export default async function handler(req, res){
  const session = requireStaff(req, res);
  if (!session) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = (req.body || {}).action;
  try{
    if (action === 'payment') return await doPayment(req, res);
    if (action === 'locker') return await doLocker(req, res);
    if (action === 'delete') return await doDelete(req, res);
    return res.status(400).json({ error: 'Unknown or missing action' });
  }catch(err){
    console.error('student-actions error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
}

async function doPayment(req, res){
  const { studentId, seatMonths, lockerMonths, amount } = req.body || {};
  if (!studentId || !amount) return res.status(400).json({ error: 'studentId and amount required' });

  const rows = await sql`select * from students where id = ${studentId}`;
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const today = todayISO();
  const currentExpiry = toDateStr(student.expiry_date);
  const currentLockerExpiry = toDateStr(student.locker_expiry_date);
  let newExpiry = currentExpiry;
  let newLockerExpiry = currentLockerExpiry;
  let note = 'Renewal';

  if (seatMonths > 0){
    const base = currentExpiry < today ? today : currentExpiry;
    newExpiry = addMonths(base, seatMonths);
    note += ' — seat +' + seatMonths + 'mo';
  }
  if (student.locker_id && lockerMonths > 0){
    const base = (currentLockerExpiry && currentLockerExpiry < today) ? today : currentLockerExpiry;
    newLockerExpiry = addMonths(base, lockerMonths);
    note += ' — locker +' + lockerMonths + 'mo';
  }

  await sql`update students set expiry_date = ${newExpiry}, locker_expiry_date = ${newLockerExpiry} where id = ${studentId}`;
  await sql`insert into payments (student_id, date, amount, note) values (${studentId}, ${today}, ${amount}, ${note})`;

  res.status(200).json({ ok: true });
}

async function doLocker(req, res){
  const { studentId, lockerAction } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });

  if (lockerAction === 'remove'){
    await sql`
      update students set
        locker_id = null, locker_floor = null, locker_join_date = null,
        locker_months = null, locker_expiry_date = null, locker_deposit = null
      where id = ${studentId}`;
    return res.status(200).json({ ok: true });
  }

  const { lockerId, floorId, months, amount } = req.body || {};
  if (!lockerId || !floorId || !months || !amount) return res.status(400).json({ error: 'lockerId, floorId, months, and amount are required' });

  const taken = await sql`select 1 from students where locker_id = ${lockerId} limit 1`;
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

async function doDelete(req, res){
  const { studentId } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });

  await sql`delete from students where id = ${studentId}`;
  res.status(200).json({ ok: true });
}
