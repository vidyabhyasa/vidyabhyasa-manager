import { sql, addMonths, todayISO, toDateStr, toImageBuffer } from '../lib/db.js';
import { requireStaff } from '../lib/auth.js';
import { sendEmail, billEmailHTML } from '../lib/email.js';
import { logAudit } from '../lib/audit.js';

const EDITABLE = {
  name: 'name', phone: 'phone', email: 'email', examPrep: 'exam_prep',
  joinDate: 'join_date', durationMonths: 'duration_months', amount: 'amount',
  lockerMonths: 'locker_months'
};

export default async function handler(req, res){
  const session = requireStaff(req, res);
  if (!session) return;
  try{
    if (req.method === 'GET'){
      if (req.query.photo) return await doPhoto(req, res);
      return await doList(req, res);
    }
    if (req.method === 'POST'){
      const action = (req.body || {}).action;
      if (action === 'edit') return await doEdit(req, res, session);
      if (action === 'approve') return await doApprove(req, res, session);
      if (action === 'reject') return await doReject(req, res, session);
      return res.status(400).json({ error: 'Unknown or missing action' });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }catch(err){
    console.error('pending error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
}

async function doList(req, res){
  const rows = await sql`
    select id, name, phone, email,
           exam_prep as "examPrep",
           to_char(join_date, 'YYYY-MM-DD') as "joinDate",
           duration_months as "durationMonths",
           seat_id as "seatId",
           floor,
           locker_id as "lockerId",
           locker_floor as "lockerFloor",
           locker_months as "lockerMonths",
           amount,
           (id_photo is not null) as "hasIdPhoto",
           (payment_screenshot is not null) as "hasPaymentScreenshot",
           rules_accepted_at as "rulesAcceptedAt",
           payment_method as "paymentMethod",
           created_at as "createdAt"
    from pending_registrations
    where status = 'pending'
    order by created_at asc`;
  res.status(200).json({ pending: rows });
}

async function doPhoto(req, res){
  const { id, type } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });
  const column = type === 'payment' ? 'payment_screenshot' : 'id_photo';
  const typeColumn = type === 'payment' ? 'payment_screenshot_type' : 'id_photo_type';

  const rows = await sql(
    `select ${column} as photo, ${typeColumn} as phototype from pending_registrations where id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row || !row.photo) return res.status(404).end();

  res.setHeader('Content-Type', row.phototype || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.status(200).send(toImageBuffer(row.photo));
}

async function doEdit(req, res, session){
  const { pendingId, fields } = req.body || {};
  if (!pendingId || !fields) return res.status(400).json({ error: 'pendingId and fields required' });

  const sets = [];
  const values = [];
  let i = 1;
  for (const key of Object.keys(fields)){
    if (!EDITABLE[key]) continue;
    sets.push(`${EDITABLE[key]} = $${i}`);
    values.push(fields[key]);
    i++;
  }
  if (!sets.length) return res.status(400).json({ error: 'No editable fields provided' });
  values.push(pendingId);

  await sql(`update pending_registrations set ${sets.join(', ')} where id = $${i} and status = 'pending'`, values);

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'edit_pending',
    targetType: 'pending', targetId: pendingId,
    details: 'Updated: ' + Object.keys(fields).join(', ')
  });

  res.status(200).json({ ok: true });
}

async function doApprove(req, res, session){
  const { pendingId } = req.body || {};
  if (!pendingId) return res.status(400).json({ error: 'pendingId required' });

  const rows = await sql`select * from pending_registrations where id = ${pendingId} and status = 'pending'`;
  const p = rows[0];
  if (!p) return res.status(404).json({ error: 'Pending request not found (it may already be resolved).' });

  const seatTaken = await sql`select 1 from students where seat_id = ${p.seat_id} limit 1`;
  if (seatTaken.length) return res.status(409).json({ error: 'That seat is now occupied by someone else. Reject this request or move it to a different seat first.' });

  const today = todayISO();
  const joinDate = toDateStr(p.join_date);
  const expiryDate = addMonths(joinDate, p.duration_months);
  const lockerExpiry = p.locker_id ? addMonths(joinDate, p.locker_months) : null;
  const idPhotoBuffer = toImageBuffer(p.id_photo);

  const inserted = await sql`
    insert into students (
      name, phone, email, exam_prep, join_date, duration_months, expiry_date,
      seat_id, floor, locker_id, locker_floor, locker_join_date, locker_months,
      locker_expiry_date, locker_deposit, id_photo, id_photo_type
    ) values (
      ${p.name}, ${p.phone}, ${p.email}, ${p.exam_prep}, ${joinDate}, ${p.duration_months}, ${expiryDate},
      ${p.seat_id}, ${p.floor}, ${p.locker_id}, ${p.locker_floor},
      ${p.locker_id ? joinDate : null}, ${p.locker_months},
      ${lockerExpiry}, ${p.locker_id ? 200 : null}, ${idPhotoBuffer}, ${p.id_photo_type}
    )
    returning id`;
  const studentId = inserted[0].id;

  const methodLabel = p.payment_method === 'cash' ? 'Cash' : 'UPI';
  await sql`
    insert into payments (student_id, date, amount, note)
    values (${studentId}, ${today}, ${p.amount}, ${(p.locker_id ? 'Registration — seat + locker' : 'Registration — seat') + ' (' + methodLabel + ')'})`;

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
        joinDate, expiryDate, lockerExpiryDate: lockerExpiry,
        durationMonths: p.duration_months, amount: p.amount
      })
    });
  }

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'approve_pending',
    targetType: 'student', targetId: studentId,
    details: p.name + ' approved — seat ' + p.seat_id + (p.locker_id ? ', locker ' + p.locker_id : '') +
      ' (bill ' + (emailResult.sent ? 'emailed' : 'not emailed: ' + emailResult.reason) + ')'
  });

  res.status(200).json({ ok: true, studentId, emailSent: emailResult.sent, emailReason: emailResult.reason });
}

async function doReject(req, res, session){
  const { pendingId, reason } = req.body || {};
  if (!pendingId) return res.status(400).json({ error: 'pendingId required' });

  const rows = await sql`select name, seat_id, locker_id from pending_registrations where id = ${pendingId}`;
  const p = rows[0];

  await sql`
    update pending_registrations set
      status = 'rejected', resolved_at = now(), resolved_by = ${session.id},
      reject_reason = ${reason || null}, payment_screenshot = null
    where id = ${pendingId} and status = 'pending'`;

  await logAudit({
    actorId: session.id, actorName: session.label, action: 'reject_pending',
    targetType: 'pending', targetId: pendingId,
    details: (p ? p.name + ' — seat ' + p.seat_id : pendingId) + (reason ? ' — reason: ' + reason : ' — no reason given')
  });

  res.status(200).json({ ok: true });
}
