import { sql } from './_db.js';
import { requireStaff } from './_auth.js';

export default async function handler(req, res){
  try{
    const session = requireStaff(req, res);
    if (!session) return;

    const rows = await sql`
      select id, name, phone, email,
             exam_prep as "examPrep",
             join_date as "joinDate",
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
             created_at as "createdAt"
      from pending_registrations
      where status = 'pending'
      order by created_at asc`;

    res.status(200).json({ pending: rows });
  }catch(err){
    console.error('pending-registrations error:', err);
    res.status(500).json({ error: err.message || 'Server error loading pending registrations' });
  }
}
