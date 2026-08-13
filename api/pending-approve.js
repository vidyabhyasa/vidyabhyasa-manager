import { sql, addMonths, todayISO } from './_db.js';
import { requireStaff } from './_auth.js';
import { sendEmail, billEmailHTML } from './_email.js';

export default async function handler(req, res){
  try{
    const session = requireStaff(req, res);
    if (!session) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { pendingId } = req.body || {};
    if (!pendingId) return res.status(400).json({ error: 'pendingId required' });

    const rows = await sql`select * from pending_registrations where id = ${pendingId} and status = 'pending'`;
    const p = rows[0];
    if (!p) return res.status(404).json({ error: 'Pending request not found (it may already be resolved).' });

    // Re-confirm the seat/locker is still actually free among live students —
    // guards against a rare edge case where it was manually assigned elsewhere.
    const seatTaken = await sql`select 1 from students where seat_id = ${p.seat_id} and expiry_date >= current_date limit 1`;
    if (seatTaken.length) return res.status(409).json({ error: 'That seat is now occupied by someone else. Reject this request or move it to a different seat first.' });

    const today = todayISO();
    const expiryDate = addMonths(p.join_date, p.duration_months);
    const lockerExpiry = p.locker_id ? addMonths(p.join_date, p.locker_months) : null;

    const inserted = await sql`
      insert into students (
        name, phone, email, exam_prep, join_date, duration_months, expiry_date,
        seat_id, floor, locker_id, locker_floor, locker_join_date, locker_months,
        locker_expiry_date, locker_deposit, id_photo, id_photo_type
      ) values (
        ${p.name}, ${p.phone}, ${p.email}, ${p.exam_prep}, ${p.join_date}, ${p.duration_months}, ${expiryDate},
        ${p.seat_id}, ${p.floor}, ${p.locker_id}, ${p.locker_floor},
        ${p.locker_id ? p.join_date : null}, ${p.locker_months},
        ${lockerExpiry}, ${p.locker_id ? 200 : null}, ${p.id_photo}, ${p.id_photo_type}
      )
      returning id`;
    const studentId = inserted[0].id;

    await sql`
      insert into payments (student_id, date, amount, note)
      values (${studentId}, ${today}, ${p.amount}, ${p.locker_id ? 'Registration — seat + locker' : 'Registration — seat'})`;

    await sql`
      update pending_registrations set
        status = 'approved', resolved_at = now(), resolved_by = ${session.id},
        payment_screenshot = null
      where id = ${pendingId}`;

    let emailResult = { sent: false, reason: 'No email on file' };
    if (p.email){
      emailResult = await sendEmail({
        to: p.email,
        subject: 'Your Vidyabhyasa registration is confirmed',
        html: billEmailHTML({
          name: p.name, seatId: p.seat_id, lockerId: p.locker_id,
          joinDate: p.join_date, expiryDate, lockerExpiryDate: lockerExpiry,
          durationMonths: p.duration_months, amount: p.amount
        })
      });
    }

    res.status(200).json({ ok: true, studentId, emailSent: emailResult.sent, emailReason: emailResult.reason });
  }catch(err){
    console.error('pending-approve error:', err);
    res.status(500).json({ error: err.message || 'Server error approving request' });
  }
}
