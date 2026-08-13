import { sql } from '../lib/db.js';

export default async function handler(req, res){
  try{
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    const required = ['name', 'phone', 'examPrep', 'joinDate', 'durationMonths', 'seatId', 'amount', 'rulesAcceptedAt'];
    for (const k of required){
      if (b[k] === undefined || b[k] === null || b[k] === '') return res.status(400).json({ error: 'Missing field: ' + k });
    }

    // A seat/locker is held if it's an active student OR an
    // unresolved pending request — either way it's not free.
    const seatTaken = await sql`
      select 1 from students where seat_id = ${b.seatId}
      union all
      select 1 from pending_registrations where seat_id = ${b.seatId} and status = 'pending'
      limit 1`;
    if (seatTaken.length) return res.status(409).json({ error: 'That seat was just taken by someone else. Please pick another.' });

    if (b.lockerId){
      const lockerTaken = await sql`
        select 1 from students where locker_id = ${b.lockerId}
        union all
        select 1 from pending_registrations where locker_id = ${b.lockerId} and status = 'pending'
        limit 1`;
      if (lockerTaken.length) return res.status(409).json({ error: 'That locker was just taken by someone else. Please pick another.' });
    }

    const idPhotoBuffer = b.photoBase64 ? Buffer.from(b.photoBase64.split(',').pop(), 'base64') : null;
    const paymentShotBuffer = b.paymentScreenshotBase64 ? Buffer.from(b.paymentScreenshotBase64.split(',').pop(), 'base64') : null;
    if (!paymentShotBuffer) return res.status(400).json({ error: 'Payment screenshot is required' });

    const rows = await sql`
      insert into pending_registrations (
        name, phone, email, exam_prep, join_date, duration_months,
        seat_id, floor, locker_id, locker_floor, locker_months, amount,
        id_photo, id_photo_type, payment_screenshot, payment_screenshot_type, rules_accepted_at
      ) values (
        ${b.name}, ${b.phone}, ${b.email || null}, ${b.examPrep}, ${b.joinDate}, ${b.durationMonths},
        ${b.seatId}, ${b.seatId.slice(0,2)}, ${b.lockerId || null}, ${b.lockerId ? b.lockerId.slice(0,2) : null},
        ${b.lockerId ? b.lockerMonths : null}, ${b.amount},
        ${idPhotoBuffer}, ${idPhotoBuffer ? 'image/jpeg' : null},
        ${paymentShotBuffer}, 'image/jpeg', ${b.rulesAcceptedAt}
      )
      returning id`;

    res.status(200).json({ id: rows[0].id, status: 'pending' });
  }catch(err){
    console.error('register error:', err);
    res.status(500).json({ error: err.message || 'Server error during registration' });
  }
}
