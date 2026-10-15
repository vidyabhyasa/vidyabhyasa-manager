import { sql, toImageBuffer } from '../lib/db.js';
import { requireStaff } from '../lib/auth.js';
import { fetchFromR2 } from '../lib/r2.js';

export default async function handler(req, res){
  const session = requireStaff(req, res);
  if (!session) return;
  try{
    if (req.query.photo) return await doPhoto(req, res);
    return await doList(req, res);
  }catch(err){
    console.error('students error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
}

async function doList(req, res){
  const students = await sql`
    select id, name, phone, email,
           exam_prep as "examPrep",
           join_date as "joinDate",
           duration_months as "durationMonths",
           expiry_date as "expiryDate",
           seat_id as "seatId",
           floor,
           locker_id as "lockerId",
           locker_floor as "lockerFloor",
           locker_join_date as "lockerJoinDate",
           locker_months as "lockerMonths",
           locker_expiry_date as "lockerExpiryDate",
           locker_deposit as "lockerDeposit",
           (id_photo is not null or id_photo_key is not null) as "hasIdPhoto"
    from students
    order by expiry_date asc`;
  const payments = await sql`
    select id, student_id as "studentId", to_char(date,'YYYY-MM-DD') as date, amount, note, payment_method as "paymentMethod",
           (screenshot_key is not null) as "hasScreenshot"
    from payments
    order by payments.date asc, created_at asc`;
  const charges = await sql`
    select id, student_id as "studentId", resource_type as "resourceType", months,
           amount_due as "amountDue", amount_paid as "amountPaid", status
    from charges
    where status = 'open'`;

  res.status(200).json({ students, payments, charges });
}

async function doPhoto(req, res){
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  // Payment screenshot for one payment row (Payment history)
  if (req.query.payment){
    const prow = (await sql`select screenshot_key from payments where id = ${id}`)[0];
    if (!prow || !prow.screenshot_key) return res.status(404).end();
    const pobj = await fetchFromR2(prow.screenshot_key);
    if (!pobj) return res.status(404).end();
    res.setHeader('Content-Type', pobj.contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).send(pobj.buffer);
  }

  const rows = await sql`select id_photo, id_photo_type, id_photo_key from students where id = ${id}`;
  const row = rows[0];
  if (!row) return res.status(404).end();

  if (row.id_photo_key){
    const obj = await fetchFromR2(row.id_photo_key);
    if (!obj) return res.status(404).end();
    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).send(obj.buffer);
  }

  if (!row.id_photo) return res.status(404).end();
  res.setHeader('Content-Type', row.id_photo_type || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.status(200).send(toImageBuffer(row.id_photo));
}
