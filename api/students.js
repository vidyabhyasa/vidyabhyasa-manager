import { sql } from './_db.js';
import { requireStaff } from './_auth.js';

export default async function handler(req, res){
  try{
    const session = requireStaff(req, res);
    if (!session) return;

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
      select id, student_id as "studentId", date, amount, note
      from payments
      order by date asc`;

    res.status(200).json({ students, payments });
  }catch(err){
    console.error('students error:', err);
    res.status(500).json({ error: err.message || 'Server error loading students' });
  }
}
