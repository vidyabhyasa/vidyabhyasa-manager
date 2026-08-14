import { sql, toImageBuffer } from '../lib/db.js';
import { requireStaff } from '../lib/auth.js';

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
           (id_photo is not null) as "hasIdPhoto"
    from students
    order by expiry_date asc`;
  const payments = await sql`
    select id, student_id as "studentId", date, amount, note, payment_method as "paymentMethod"
    from payments
    order by date asc`;

  res.status(200).json({ students, payments });
}

async function doPhoto(req, res){
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  const rows = await sql`select id_photo, id_photo_type from students where id = ${id}`;
  const row = rows[0];
  if (!row || !row.id_photo) return res.status(404).end();

  res.setHeader('Content-Type', row.id_photo_type || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.status(200).send(toImageBuffer(row.id_photo));
}
