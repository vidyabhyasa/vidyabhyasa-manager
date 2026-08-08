import { sql, addMonths, todayISO } from './_db.js';
import { requireStaff } from './_auth.js';

export default async function handler(req, res){
  const session = requireStaff(req, res);
  if (!session) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId, seatMonths, lockerMonths, amount } = req.body || {};
  if (!studentId || !amount) return res.status(400).json({ error: 'studentId and amount required' });

  const rows = await sql`select * from students where id = ${studentId}`;
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const today = todayISO();
  let newExpiry = student.expiry_date;
  let newLockerExpiry = student.locker_expiry_date;
  let note = 'Renewal';

  if (seatMonths > 0){
    const base = student.expiry_date < today ? today : student.expiry_date;
    newExpiry = addMonths(base, seatMonths);
    note += ' — seat +' + seatMonths + 'mo';
  }
  if (student.locker_id && lockerMonths > 0){
    const base = (student.locker_expiry_date && student.locker_expiry_date < today) ? today : student.locker_expiry_date;
    newLockerExpiry = addMonths(base, lockerMonths);
    note += ' — locker +' + lockerMonths + 'mo';
  }

  await sql`update students set expiry_date = ${newExpiry}, locker_expiry_date = ${newLockerExpiry} where id = ${studentId}`;
  await sql`insert into payments (student_id, date, amount, note) values (${studentId}, ${today}, ${amount}, ${note})`;

  res.status(200).json({ ok: true });
}
