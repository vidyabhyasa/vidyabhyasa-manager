import { sql } from '../lib/db.js';
import { logAudit } from '../lib/audit.js';
import { branchOfResource } from '../lib/layout.js';
import { uploadToR2, newObjectKey, isR2Configured } from '../lib/r2.js';

export default async function handler(req, res){
  try{
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    const required = ['name', 'phone', 'email', 'examPrep', 'joinDate', 'durationMonths', 'seatId', 'amount', 'rulesAcceptedAt'];
    for (const k of required){
      if (b[k] === undefined || b[k] === null || b[k] === '') return res.status(400).json({ error: 'Missing field: ' + k });
    }

    const seatBranch = branchOfResource(b.seatId);
    if (!seatBranch) return res.status(400).json({ error: 'That seat does not exist.' });
    if (b.lockerId){
      const lockerBranch = branchOfResource(b.lockerId);
      if (!lockerBranch || lockerBranch.id !== seatBranch.id) return res.status(400).json({ error: 'That locker is not available at this branch.' });
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
    const paymentMethod = b.paymentMethod === 'cash' ? 'cash' : 'upi';
    if (paymentMethod === 'upi' && !paymentShotBuffer) return res.status(400).json({ error: 'Payment screenshot is required for UPI payments' });

    let idPhotoKey = null, paymentShotKey = null;
    let idPhotoLegacy = null, paymentShotLegacy = null;
    if (isR2Configured()){
      if (idPhotoBuffer){ idPhotoKey = newObjectKey('id-photos'); await uploadToR2(idPhotoKey, idPhotoBuffer, 'image/jpeg'); }
      if (paymentShotBuffer){ paymentShotKey = newObjectKey('payment-screenshots'); await uploadToR2(paymentShotKey, paymentShotBuffer, 'image/jpeg'); }
    } else {
      // R2 not set up yet — fall back to the old bytea columns so
      // uploads still work rather than silently disappearing.
      idPhotoLegacy = idPhotoBuffer;
      paymentShotLegacy = paymentShotBuffer;
    }

    const rows = await sql`
      insert into pending_registrations (
        name, phone, email, exam_prep, join_date, duration_months,
        seat_id, floor, locker_id, locker_floor, locker_months, amount, branch_id,
        id_photo, id_photo_type, id_photo_key,
        payment_screenshot, payment_screenshot_type, payment_screenshot_key,
        rules_accepted_at, payment_method
      ) values (
        ${b.name}, ${b.phone}, ${b.email || null}, ${b.examPrep}, ${b.joinDate}, ${b.durationMonths},
        ${b.seatId}, ${b.seatId.split('-')[0]}, ${b.lockerId || null}, ${b.lockerId ? b.lockerId.split('-')[0] : null},
        ${b.lockerId ? b.lockerMonths : null}, ${b.amount}, ${seatBranch.id},
        ${idPhotoLegacy}, ${idPhotoLegacy ? 'image/jpeg' : null}, ${idPhotoKey},
        ${paymentShotLegacy}, ${paymentShotLegacy ? 'image/jpeg' : null}, ${paymentShotKey},
        ${b.rulesAcceptedAt}, ${paymentMethod}
      )
      returning id`;

    await logAudit({
      actorId: null, actorName: 'Student (online form)', action: 'new_registration',
      targetType: 'pending', targetId: rows[0].id,
      details: b.name + ' submitted a registration (' + seatBranch.name + ') — seat ' + b.seatId + (b.lockerId ? ', locker ' + b.lockerId : '') +
        ', ' + b.durationMonths + ' mo, ₹' + b.amount + ' (' + (paymentMethod === 'cash' ? 'Cash' : 'UPI') + ')'
    });

    res.status(200).json({ id: rows[0].id, status: 'pending' });
  }catch(err){
    console.error('register error:', err);
    res.status(500).json({ error: err.message || 'Server error during registration' });
  }
}
