export const FLOORS = [
  { id:'F1', label:'First floor', sub:'Non-AC', count:87 },
  { id:'F2', label:'Second floor', sub:'AC', count:43 }
];
export const LOCKERS = [
  { id:'L1', label:'1st floor lockers', sub:'', count:32 },
  { id:'L2', label:'2nd floor lockers', sub:'', count:16 }
];
export const LOCKER_MONTHLY = 100;
export const LOCKER_DEPOSIT = 200;
export const SEAT_TO_LOCKER_FLOOR = { F1:'L1', F2:'L2' };

export function seatLabel(floorId, num){ return floorId + '-' + String(num).padStart(2,'0'); }
export function lockerLabel(floorId, num){ return floorId + '-' + String(num).padStart(2,'0'); }

// Seat pricing scale: 1mo=1000, 2mo=1900, 3mo=2800 — i.e. ₹100 base
// + ₹900/month. Kept in sync with index.html's presetForMonths().
export function presetForMonths(months){
  return 100 + 900 * Number(months);
}
