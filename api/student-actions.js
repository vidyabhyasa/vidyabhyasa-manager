import { sql, addMonths, todayISO, toDateStr } from '../lib/db.js';
import { requireStaff } from '../lib/auth.js';
import { sendEmail, billEmailHTML } from '../lib/email.js';
import { logAudit } from '../lib/audit.js';
import { signBillToken } from '../lib/billToken.js';

const EDITABLE_STUDENT = {
  name: 'name', phone: 'phone', email: 'email', examPrep: 'exam_prep'
};

export default async function handler(req, res){
  const session = requireStaff(req, res);
  if (!session) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = (req.body || {}).action;
  try{
    if (action === 'startCharge') return await doStartCharge(req, res, session);
    if (action === 'payCharge') return await doPayCharge(req, res, session);
    if (action === 'cancelCharge') return await doCancelCharge(req, res, session);
    if (action === 'miscPayment') return await doMiscPayment(req, res, session);
    if (action === 'locker') return await doLocker(req, res, session);
    if (action === 'delete') return await doDelete(req, res, session);
    if (action === 'edit') return await doEdit(req, res, session);
    if (action === 'swap') return await doSwap(req, res, session);
    if (action === 'resendBill') return await doResendBill(req, res, session);
    if (action === 'generateBillToken') return await doGenerateBillToken(req, res, session);
    if (action === 'uploadIdPhoto') return await doUploadIdPhoto(req, res, session);
    if (action === 'editPayment') return await doEditPayment(req, res, session);
    if (action === 'deletePayment') return await doDeletePayment(req, res, session);
    return res.status(400).json({ error: 'Unknown or missing action' });
  }catch(err){
    console.error('student-actions error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
}

// Applies a fully-paid charge's extension to the student's seat or
// locker expiry date. Only ever called once a charge's amount_paid
// has reached its amount_due.
async function applyChargeExtension(student, resourceType, months){
  const today = todayISO();
  if (resourceType === 'seat'){
    const currentExpiry = toDateStr(student.expiry_date);
    const base = currentExpiry < today ? today : currentExpiry;
    const newExpiry = addMonths(base, months);
    await sql`update students set expiry_date = ${newExpiry} where id = ${student.id}`;
  } else {
    const currentLockerExpiry = toDateStr(student.locker_expiry_date);
    const base = (currentLockerExpiry && currentLockerExpiry < today) ? today : currentLockerExpiry;
    const newLockerExpiry = addMonths(base, months);
    await sql`update students set locker_expiry_date = ${newLockerExpiry} where id = ${student.id}`;
  }
}

async function doStartCharge(req, res, session){
  const { studentId, resourceType, months, amountDue, amountPaid, paymentMethod } = req.body || {};
  if (!studentId || !resourceType || !months || !amountDue || amountPaid === undefined){
    return res.status(400).json({ error: 'studentId, resourceType, months, amountDue, and amountPaid are required' });
  }
  if (!['seat','locker'].includes(resourceType)) return res.status(400).json({ error: "resourceType must be 'seat' or 'locker'" });

  const rows = await sql`select * from students where id = ${studentId}`;
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (resourceType === 'locker' && !student.locker_id) return res.status(400).json({ error: 'Student has no locker' });

  const existingOpen = await sql`select id from charges where student_id = ${studentId} and resource_type = ${resourceType} and status = 'open' limit 1`;
  if (existingOpen.length) return res.status(409).json({ error: 'There is already an open charge for this ' + resourceType + ' — pay or cancel it first.' });

  const methodValue = paymentMethod === 'cash' ? 'cash' : 'upi';
  const due = Number(amountDue);
  const paidNow = Number(amountPaid);
  const isFullyPaid = paidNow >= due;
  const nowIso = new Date().toISOString();

  const chargeRows = await sql`
    insert into charges (student_id, resource_type, months, amount_due, amount_paid, status, created_by, applied_at)
    values (${studentId}, ${resourceType}, ${months}, ${due}, ${paidNow}, ${isFullyPaid ? 'paid' : 'open'}, ${session.id}, ${isFullyPaid ? nowIso : null})
    returning id`;
  const chargeId = chargeRows[0].id;

  const today = todayISO();
  const note = 'Renewal — ' + resourceType + ' +' + months + 'mo' + (isFullyPaid ? '' : ' (partial)');
  await sql`
    insert into payments (student_id, date, amount, note, payment_method, charge_id)
    values (${studentId}, ${today}, ${paidNow}, ${note}, ${methodValue}, ${chargeId})`;

  if (isFullyPaid && months > 0) await applyChargeExtension(student, resourceType, months);

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'record_payment',
    targetType: 'student', targetId: studentId,
    details: student.name + ' — ₹' + paidNow + ' of ₹' + due + ' (' + note + ', ' + (methodValue === 'cash' ? 'Cash' : 'UPI') + ')' + (isFullyPaid ? '' : ' — balance ₹' + (due - paidNow))
  });

  res.status(200).json({ ok: true, fullyPaid: isFullyPaid, remaining: Math.max(0, due - paidNow) });
}

async function doPayCharge(req, res, session){
  const { chargeId, amountPaid, paymentMethod } = req.body || {};
  if (!chargeId || amountPaid === undefined) return res.status(400).json({ error: 'chargeId and amountPaid required' });

  const rows = await sql`select * from charges where id = ${chargeId}`;
  const charge = rows[0];
  if (!charge) return res.status(404).json({ error: 'Charge not found' });
  if (charge.status !== 'open') return res.status(400).json({ error: 'This charge is already ' + charge.status });

  const studentRows = await sql`select * from students where id = ${charge.student_id}`;
  const student = studentRows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const methodValue = paymentMethod === 'cash' ? 'cash' : 'upi';
  const paidNow = Number(amountPaid);
  const newAmountPaid = Number(charge.amount_paid) + paidNow;
  const due = Number(charge.amount_due);
  const isFullyPaid = newAmountPaid >= due;
  const nowIso = new Date().toISOString();
  const today = todayISO();

  await sql`
    update charges set amount_paid = ${newAmountPaid}, status = ${isFullyPaid ? 'paid' : 'open'},
      applied_at = ${isFullyPaid ? nowIso : charge.applied_at}
    where id = ${chargeId}`;

  const note = 'Renewal — ' + charge.resource_type + ' +' + charge.months + 'mo' + (isFullyPaid ? ' (balance cleared)' : ' (partial)');
  await sql`
    insert into payments (student_id, date, amount, note, payment_method, charge_id)
    values (${student.id}, ${today}, ${paidNow}, ${note}, ${methodValue}, ${chargeId})`;

  if (isFullyPaid && charge.months > 0) await applyChargeExtension(student, charge.resource_type, charge.months);

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'record_payment',
    targetType: 'student', targetId: student.id,
    details: student.name + ' — ₹' + paidNow + ' toward open ' + charge.resource_type + ' charge (' + (methodValue === 'cash' ? 'Cash' : 'UPI') + ')' +
      (isFullyPaid ? ' — balance cleared, extension applied' : ' — remaining ₹' + (due - newAmountPaid))
  });

  res.status(200).json({ ok: true, fullyPaid: isFullyPaid, remaining: Math.max(0, due - newAmountPaid) });
}

async function doCancelCharge(req, res, session){
  const { chargeId, reason } = req.body || {};
  if (!chargeId) return res.status(400).json({ error: 'chargeId required' });

  const rows = await sql`select c.*, s.name as student_name from charges c join students s on s.id = c.student_id where c.id = ${chargeId}`;
  const charge = rows[0];
  if (!charge) return res.status(404).json({ error: 'Charge not found' });
  if (charge.status !== 'open') return res.status(400).json({ error: 'This charge is already ' + charge.status });

  await sql`update charges set status = 'cancelled', cancelled_at = now(), cancelled_by = ${session.id}, cancel_reason = ${reason || null} where id = ${chargeId}`;

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'cancel_charge',
    targetType: 'student', targetId: charge.student_id,
    details: charge.student_name + ' — cancelled open ' + charge.resource_type + ' charge (₹' + charge.amount_paid + ' of ₹' + charge.amount_due + ' was paid)' + (reason ? ' — reason: ' + reason : '')
  });

  res.status(200).json({ ok: true });
}

// A one-off payment not tied to any renewal — doesn't touch dates.
async function doMiscPayment(req, res, session){
  const { studentId, amount, paymentMethod, note } = req.body || {};
  if (!studentId || !amount) return res.status(400).json({ error: 'studentId and amount required' });

  const rows = await sql`select id, name from students where id = ${studentId}`;
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const methodValue = paymentMethod === 'cash' ? 'cash' : 'upi';
  const today = todayISO();
  const finalNote = note && note.trim() ? note.trim() : 'Payment';
  await sql`insert into payments (student_id, date, amount, note, payment_method) values (${studentId}, ${today}, ${amount}, ${finalNote}, ${methodValue})`;

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'record_payment',
    targetType: 'student', targetId: studentId,
    details: student.name + ' — ₹' + amount + ' (' + finalNote + ', ' + (methodValue === 'cash' ? 'Cash' : 'UPI') + ')'
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

async function doGenerateBillToken(req, res, session){
  const { studentId } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });

  const rows = await sql`select id, name from students where id = ${studentId}`;
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const token = signBillToken(studentId);

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'resend_bill',
    targetType: 'student', targetId: studentId,
    details: student.name + ' — bill QR link generated'
  });

  res.status(200).json({ token });
}

async function doUploadIdPhoto(req, res, session){
  const { studentId, photoBase64 } = req.body || {};
  if (!studentId || !photoBase64) return res.status(400).json({ error: 'studentId and photoBase64 required' });

  const rows = await sql`select id, name from students where id = ${studentId}`;
  const student = rows[0];
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const buffer = Buffer.from(photoBase64.split(',').pop(), 'base64');
  await sql`update students set id_photo = ${buffer}, id_photo_type = 'image/jpeg' where id = ${studentId}`;

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'edit_student',
    targetType: 'student', targetId: studentId,
    details: student.name + ' — ID photo uploaded by staff'
  });

  res.status(200).json({ ok: true });
}

async function doEditPayment(req, res, session){
  if (session.role !== 'founder') return res.status(403).json({ error: 'Founder access only' });
  const { paymentId, amount, note, paymentMethod } = req.body || {};
  if (!paymentId || amount === undefined) return res.status(400).json({ error: 'paymentId and amount required' });

  const methodValue = paymentMethod === 'cash' ? 'cash' : 'upi';
  await sql`update payments set amount = ${amount}, note = ${note || null}, payment_method = ${methodValue} where id = ${paymentId}`;

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'edit_payment',
    targetType: 'payment', targetId: paymentId,
    details: 'Amount set to ₹' + amount + (note ? ' — note: ' + note : '') + ' (' + (methodValue === 'cash' ? 'Cash' : 'UPI') + ')'
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
