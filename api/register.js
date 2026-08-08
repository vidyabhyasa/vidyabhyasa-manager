import { sql, addMonths, todayISO } from './_db.js';

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = req.body || {};
  const required = ['name', 'phone', 'examPrep', 'joinDate', 'durationMonths', 'seatId', 'amount'];
  for (const k of required){
    if (b[k] === undefined || b[k] === null || b[k] === '') return res.status(400).json({ error: 'Missing field: ' + k });
  }

  const seatTaken = await sql`select 1 from students where seat_id = ${b.seatId} and expiry_date >= current_date limit 1`;
  if (seatTaken.length) return res.status(409).json({ error: 'That seat was just taken by someone else. Please pick another.' });

  if (b.lockerId){
    const lockerTaken = await sql`select 1 from students where locker_id = ${b.lockerId} and locker_expiry_date >= current_date limit 1`;
    if (lockerTaken.length) return res.status(409).json({ error: 'That locker was just taken by someone else. Please pick another.' });
  }

  const expiryDate = addMonths(b.joinDate, b.durationMonths);
  const lockerExpiry = b.lockerId ? addMonths(b.joinDate, b.lockerMonths) : null;
  const photoBuffer = b.photoBase64 ? Buffer.from(b.photoBase64.split(',').pop(), 'base64') : null;

  const rows = await sql`
    insert into students (
      name, phone, email, exam_prep, join_date, duration_months, expiry_date,
      seat_id, floor, locker_id, locker_floor, locker_join_date, locker_months,
      locker_expiry_date, locker_deposit, id_photo, id_photo_type
    ) values (
      ${b.name}, ${b.phone}, ${b.email || null}, ${b.examPrep}, ${b.joinDate}, ${b.durationMonths}, ${expiryDate},
      ${b.seatId}, ${b.seatId.slice(0,2)}, ${b.lockerId || null}, ${b.lockerId ? b.lockerId.slice(0,2) : null},
      ${b.lockerId ? b.joinDate : null}, ${b.lockerId ? b.lockerMonths : null},
      ${lockerExpiry}, ${b.lockerId ? 200 : null}, ${photoBuffer}, ${photoBuffer ? 'image/jpeg' : null}
    )
    returning id`;

  const studentId = rows[0].id;
  await sql`
    insert into payments (student_id, date, amount, note)
    values (${studentId}, ${todayISO()}, ${b.amount}, ${b.lockerId ? 'Registration — seat + locker' : 'Registration — seat'})`;

  res.status(200).json({ id: studentId });
}
