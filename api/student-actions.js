import { sql, addMonths, todayISO, toDateStr } from '../lib/db.js';
import { requireStaff } from '../lib/auth.js';
import { sendEmail, billEmailHTML } from '../lib/email.js';
import { logAudit } from '../lib/audit.js';

const EDITABLE_STUDENT = {
  name: 'name', phone: 'phone', email: 'email', examPrep: 'exam_prep'
};

export default async function handler(req, res){
  const session = requireStaff(req, res);
  if (!session) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = (req.body || {}).action;
  try{
    if (action === 'payment') return await doPayment(req, res, session);
    if (action === 'locker') return await doLocker(req, res, session);
    if (action === 'delete') return await doDelete(req, res, session);
    if (action === 'edit') return await doEdit(req, res, session);
    if (action === 'swap') return await doSwap(req, res, session);
    if (action === 'resendBill') return await doResendBill(req, res, session);
    if (action === 'editPayment') return await doEditPayment(req, res, session);
    if (action === 'deletePayment') return await doDeletePayment(req, res, session);
    return res.status(400).json({ error: 'Unknown or missing action' });
  }catch(err){
    console.error('student-actions error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
}

async function doPayment(req, res, session){
  const { studentId, seatMonths, lockerMonths, amount, paymentMethod } = req.body || {};
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
  note += ' (' + (paymentMethod === 'cash' ? 'Cash' : 'UPI') + ')';

  await sql`update students set expiry_date = ${newExpiry}, locker_expiry_date = ${newLockerExpiry} where id = ${studentId}`;
  await sql`insert into payments (student_id, date, amount, note) values (${studentId}, ${today}, ${amount}, ${note})`;

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'record_payment',
    targetType: 'student', targetId: studentId,
    details: student.name + ' — ₹' + amount + ' (' + note + ')'
  });

  res.status(200).json({ ok: true });
}

async function doLocker(req, res, session){
  const { studentId, lockerAction } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });

  const rows = await sql`select name, locker_id from students where id = ${studentId}`;
  const student = rows[0];

  if (lockerAction === 'remove'){
    await sql`
      update students set
        locker_id = null, locker_floor = null, locker_join_date = null,
        locker_months = null, locker_expiry_date = null, locker_deposit = null
      where id = ${studentId}`;
    await logAudit({
      actorId: session.id, actorName: session.label, action: 'remove_locker',
      targetType: 'student', targetId: studentId,
      details: (student ? student.name : studentId) + ' — locker ' + (student ? student.locker_id : '') + ' removed'
    });
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

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'assign_locker',
    targetType: 'student', targetId: studentId,
    details: (student ? student.name : studentId) + ' — locker ' + lockerId + ' assigned (' + months + 'mo, ₹' + amount + ')'
  });

  res.status(200).json({ ok: true });
}

async function doDelete(req, res, session){
  const { studentId, reason } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });

  const rows = await sql`select * from students where id = ${studentId}`;
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });

  await sql`delete from students where id = ${studentId}`;

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'remove_student',
    targetType: 'student', targetId: studentId,
    details: student.name + ' (seat ' + student.seat_id + (student.locker_id ? ', locker ' + student.locker_id : '') + ')' +
      (reason ? ' — reason: ' + reason : ' — no reason given')
  });

  res.status(200).json({ ok: true });
}

async function doEdit(req, res, session){
  const { studentId, fields } = req.body || {};
  if (!studentId || !fields) return res.status(400).json({ error: 'studentId and fields required' });

  const sets = [];
  const values = [];
  let i = 1;
  for (const key of Object.keys(fields)){
    if (!EDITABLE_STUDENT[key]) continue;
    sets.push(`${EDITABLE_STUDENT[key]} = $${i}`);
    values.push(fields[key]);
    i++;
  }
  if (!sets.length) return res.status(400).json({ error: 'No editable fields provided' });
  values.push(studentId);

  await sql(`update students set ${sets.join(', ')} where id = $${i}`, values);

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'edit_student',
    targetType: 'student', targetId: studentId,
    details: 'Updated: ' + Object.keys(fields).join(', ')
  });

  res.status(200).json({ ok: true });
}

async function doSwap(req, res, session){
  const { studentId, kind, targetId, targetFloor } = req.body || {};
  if (!studentId || !kind || !targetId || !targetFloor) return res.status(400).json({ error: 'studentId, kind, targetId, and targetFloor are required' });

  const rows = await sql`select * from students where id = ${studentId}`;
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });

  if (kind === 'seat'){
    const taken = await sql`select 1 from students where seat_id = ${targetId} and id != ${studentId} limit 1`;
    if (taken.length) return res.status(409).json({ error: 'That seat is already occupied. Pick another.' });
    const fromSeat = student.seat_id;
    await sql`update students set seat_id = ${targetId}, floor = ${targetFloor} where id = ${studentId}`;
    await logAudit({
      actorId: session.id, actorName: session.label, action: 'swap_seat',
      targetType: 'student', targetId: studentId,
      details: student.name + ' moved from seat ' + fromSeat + ' to ' + targetId
    });
  } else if (kind === 'locker'){
    const taken = await sql`select 1 from students where locker_id = ${targetId} and id != ${studentId} limit 1`;
    if (taken.length) return res.status(409).json({ error: 'That locker is already assigned. Pick another.' });
    const fromLocker = student.locker_id;
    await sql`update students set locker_id = ${targetId}, locker_floor = ${targetFloor} where id = ${studentId}`;
    await logAudit({
      actorId: session.id, actorName: session.label, action: 'swap_locker',
      targetType: 'student', targetId: studentId,
      details: student.name + ' moved from locker ' + (fromLocker || '—') + ' to ' + targetId
    });
  } else {
    return res.status(400).json({ error: "kind must be 'seat' or 'locker'" });
  }

  res.status(200).json({ ok: true });
}

async function doResendBill(req, res, session){
  const { studentId } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });

  const rows = await sql`select * from students where id = ${studentId}`;
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!student.email) return res.status(400).json({ error: 'This student has no email on file' });

  const result = await sendEmail({
    to: student.email,
    subject: 'Your Vidyabhyasa bill',
    html: billEmailHTML({
      name: student.name, seatId: student.seat_id, lockerId: student.locker_id,
      joinDate: toDateStr(student.join_date), expiryDate: toDateStr(student.expiry_date),
      lockerExpiryDate: toDateStr(student.locker_expiry_date),
      durationMonths: student.duration_months, amount: '(see payment history)'
    })
  });

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'resend_bill',
    targetType: 'student', targetId: studentId,
    details: student.name + ' — bill re-emailed to ' + student.email
  });

  res.status(200).json({ ok: true, emailSent: result.sent, emailReason: result.reason });
}

async function doEditPayment(req, res, session){
  if (session.role !== 'founder') return res.status(403).json({ error: 'Founder access only' });
  const { paymentId, amount, note } = req.body || {};
  if (!paymentId || amount === undefined) return res.status(400).json({ error: 'paymentId and amount required' });

  await sql`update payments set amount = ${amount}, note = ${note || null} where id = ${paymentId}`;

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'edit_payment',
    targetType: 'payment', targetId: paymentId,
    details: 'Amount set to ₹' + amount + (note ? ' — note: ' + note : '')
  });

  res.status(200).json({ ok: true });
}

async function doDeletePayment(req, res, session){
  if (session.role !== 'founder') return res.status(403).json({ error: 'Founder access only' });
  const { paymentId } = req.body || {};
  if (!paymentId) return res.status(400).json({ error: 'paymentId required' });

  const rows = await sql`select * from payments where id = ${paymentId}`;
  const payment = rows[0];
  await sql`delete from payments where id = ${paymentId}`;

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'delete_payment',
    targetType: 'payment', targetId: paymentId,
    details: payment ? ('₹' + payment.amount + ' (' + payment.note + ') removed') : 'Payment removed'
  });

  res.status(200).json({ ok: true });
}
