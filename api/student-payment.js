import { sql, addMonths, todayISO, toDateStr } from './_db.js';
import { requireStaff } from './_auth.js';

export default async function handler(req, res){
  try{
    const session = requireStaff(req, res);
    if (!session) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
  }catch(err){
    console.error('student-payment error:', err);
    res.status(500).json({ error: err.message || 'Server error recording payment' });
  }
}
