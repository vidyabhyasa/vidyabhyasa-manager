import { sql } from '../lib/db.js';
import { requireStaff } from '../lib/auth.js';
import { FLOORS, LOCKERS } from '../lib/layout.js';

const TOTAL_SEATS = FLOORS.reduce((a,f)=>a+f.count, 0);
const TOTAL_LOCKERS = LOCKERS.reduce((a,f)=>a+f.count, 0);

function daysUntil(dateStr, today){
  const t = new Date(today);
  const target = new Date(dateStr);
  return Math.round((target - t) / 86400000);
}

export default async function handler(req, res){
  try{
    const session = requireStaff(req, res);
    if (!session) return;
    if (session.role !== 'founder') return res.status(403).json({ error: 'Founder access only' });

    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates required' });

    const payments = await sql`select amount, note, date, payment_method as "paymentMethod" from payments where date >= ${from} and date <= ${to}`;
    const newRegs = await sql`
      select floor,
             duration_months as "durationMonths",
             locker_id as "lockerId",
             exam_prep as "examPrep"
      from students
      where join_date >= ${from} and join_date <= ${to}`;
    const allStudents = await sql`
      select floor, locker_id as "lockerId", expiry_date as "expiryDate", locker_expiry_date as "lockerExpiryDate"
      from students`;

    let totalRevenue = 0, registrationRevenue = 0, renewalRevenue = 0, lockerRevenue = 0;
    let cashRevenue = 0, upiRevenue = 0;
    payments.forEach(p=>{
      const amt = Number(p.amount);
      totalRevenue += amt;
      const note = p.note || '';
      if (note.startsWith('Registration')) registrationRevenue += amt;
      else if (note.startsWith('Renewal')) renewalRevenue += amt;
      else if (note.startsWith('Locker assigned')) lockerRevenue += amt;
      if (p.paymentMethod === 'cash') cashRevenue += amt;
      else upiRevenue += amt;
    });

    const newRegistrations = newRegs.length;
    const lockerAttachCountNew = newRegs.filter(r=>r.lockerId).length;
    const avgDurationMonths = newRegistrations
      ? Math.round((newRegs.reduce((a,r)=>a+Number(r.durationMonths),0) / newRegistrations) * 10) / 10
      : 0;

    const byFloor = {};
    newRegs.forEach(r=>{ byFloor[r.floor] = (byFloor[r.floor]||0) + 1; });

    const examCounts = {};
    newRegs.forEach(r=>{
      const key = (r.examPrep || 'Unspecified').trim() || 'Unspecified';
      examCounts[key] = (examCounts[key]||0) + 1;
    });
    const topExams = Object.entries(examCounts)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,8)
      .map(([exam,count])=>({ exam, count }));

    const today = new Date().toISOString().slice(0,10);
    const totalActiveStudents = allStudents.length;
    const activeWithLocker = allStudents.filter(s=>s.lockerId).length;

    let warningCount = 0, overdueCount = 0, criticalCount = 0;
    allStudents.forEach(s=>{
      const d = daysUntil(s.expiryDate, today);
      if (d <= -1) criticalCount++;
      else if (d === 0) overdueCount++;
      else if (d <= 2) warningCount++;
    });

    const cleanupPending = await sql`select count(*)::int as c from cleanup_flags where cleared_at is null`;
    const needsCleaning = cleanupPending[0] ? cleanupPending[0].c : 0;

    res.status(200).json({
      range: { from, to },
      revenue: {
        total: totalRevenue,
        registration: registrationRevenue,
        renewal: renewalRevenue,
        locker: lockerRevenue,
        cash: cashRevenue,
        upi: upiRevenue,
        paymentCount: payments.length,
        avgPayment: payments.length ? Math.round(totalRevenue / payments.length) : 0
      },
      registrations: {
        count: newRegistrations,
        avgDurationMonths,
        lockerAttachRate: newRegistrations ? Math.round((lockerAttachCountNew / newRegistrations) * 100) : 0,
        byFloor
      },
      topExams,
      snapshot: {
        totalActiveStudents,
        seatOccupancyPct: Math.round((totalActiveStudents / TOTAL_SEATS) * 100),
        activeWithLocker,
        lockerOccupancyPct: Math.round((activeWithLocker / TOTAL_LOCKERS) * 100),
        warningCount,
        overdueCount,
        criticalCount,
        needsCleaning
      }
    });
  }catch(err){
    console.error('reports error:', err);
    res.status(500).json({ error: err.message || 'Server error generating report' });
  }
}
