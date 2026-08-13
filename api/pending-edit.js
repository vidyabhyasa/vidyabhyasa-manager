import { sql } from './_db.js';
import { requireStaff } from './_auth.js';

const EDITABLE = {
  name: 'name', phone: 'phone', email: 'email', examPrep: 'exam_prep',
  joinDate: 'join_date', durationMonths: 'duration_months', amount: 'amount',
  lockerMonths: 'locker_months'
};

export default async function handler(req, res){
  try{
    const session = requireStaff(req, res);
    if (!session) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
    res.status(200).json({ ok: true });
  }catch(err){
    console.error('pending-edit error:', err);
    res.status(500).json({ error: err.message || 'Server error updating request' });
  }
}
