import { sql } from '../lib/db.js';
import { FLOORS, LOCKERS, seatLabel, lockerLabel } from '../lib/layout.js';

export default async function handler(req, res){
  try{
    const occupiedSeats = await sql`
      select seat_id from students
      union
      select seat_id from pending_registrations where status = 'pending'`;
    const occupiedLockers = await sql`
      select locker_id from students where locker_id is not null
      union
      select locker_id from pending_registrations where locker_id is not null and status = 'pending'`;
    const occSeatSet = new Set(occupiedSeats.map(r => r.seat_id));
    const occLockerSet = new Set(occupiedLockers.map(r => r.locker_id));

    const freeSeats = [];
    FLOORS.forEach(f => {
      for (let i = 1; i <= f.count; i++){
        const label = seatLabel(f.id, i);
        if (!occSeatSet.has(label)) freeSeats.push({ floor: f.id, num: i, resourceId: label });
      }
    });

    const freeLockers = [];
    LOCKERS.forEach(f => {
      for (let i = 1; i <= f.count; i++){
        const label = lockerLabel(f.id, i);
        if (!occLockerSet.has(label)) freeLockers.push({ floor: f.id, num: i, resourceId: label });
      }
    });

    res.status(200).json({ freeSeats, freeLockers });
  }catch(err){
    console.error('availability error:', err);
    res.status(500).json({ error: err.message || 'Server error loading availability' });
  }
}
