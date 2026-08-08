import { sql } from './_db.js';
import { FLOORS, LOCKERS, seatLabel, lockerLabel } from './_layout.js';

export default async function handler(req, res){
  const occupiedSeats = await sql`select seat_id from students where expiry_date >= current_date`;
  const occupiedLockers = await sql`select locker_id from students where locker_id is not null and locker_expiry_date >= current_date`;
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
}
