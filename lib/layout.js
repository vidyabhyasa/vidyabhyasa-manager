// Branches. Each branch has its own floors/lockers. Floor and locker ids
// are unique across branches (TK: F1/F2/L1/L2, Ramakrishna Nagar: R1/RL1),
// so a seat id like "R1-05" always identifies exactly one seat.
// Keep in sync with BRANCHES in index.html.
export const BRANCHES = [
  {
    id: 'tk', slug: 'tk-layout', name: 'TK Layout',
    floors: [
      { id:'F1', label:'First floor', sub:'Non-AC', count:87 },
      { id:'F2', label:'Second floor', sub:'AC', count:43 }
    ],
    lockers: [
      { id:'L1', label:'1st floor lockers', sub:'', count:32 },
      { id:'L2', label:'2nd floor lockers', sub:'', count:16 }
    ],
    seatToLockerFloor: { F1:'L1', F2:'L2' }
  },
  {
    id: 'rk', slug: 'ramakrishna-nagar', name: 'Ramakrishna Nagar',
    floors: [
      { id:'R1', label:'Study hall', sub:'Non-AC', count:150 }
    ],
    lockers: [
      { id:'RL1', label:'Lockers', sub:'', count:20 }
    ],
    seatToLockerFloor: { R1:'RL1' }
  }
];

// All branches combined (used by availability / reports).
export const FLOORS = BRANCHES.flatMap(b => b.floors);
export const LOCKERS = BRANCHES.flatMap(b => b.lockers);
export const LOCKER_MONTHLY = 100;
export const LOCKER_DEPOSIT = 200;

export function branchById(id){ return BRANCHES.find(b => b.id === id) || null; }

// "R1-05" or "RL1-03" -> the branch that owns that floor/locker prefix.
export function branchOfResource(resourceId){
  if (!resourceId) return null;
  const prefix = String(resourceId).split('-')[0];
  const num = Number(String(resourceId).split('-')[1]);
  for (const b of BRANCHES){
    const f = b.floors.find(x => x.id === prefix) || b.lockers.find(x => x.id === prefix);
    if (f && num >= 1 && num <= f.count) return b;
  }
  return null;
}

export function seatLabel(floorId, num){ return floorId + '-' + String(num).padStart(2,'0'); }
export function lockerLabel(floorId, num){ return floorId + '-' + String(num).padStart(2,'0'); }

// Seat pricing scale: 1mo=1000, 2mo=1900, 3mo=2800 — i.e. ₹100 base
// + ₹900/month. Kept in sync with index.html's presetForMonths().
export function presetForMonths(months){
  return 100 + 900 * Number(months);
}
