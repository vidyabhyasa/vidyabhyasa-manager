import { sql } from './_db.js';
import { requireStaff } from './_auth.js';

export default async function handler(req, res){
  try{
    const session = requireStaff(req, res);
    if (!session) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { pendingId, reason } = req.body || {};
    if (!pendingId) return res.status(400).json({ error: 'pendingId required' });

    await sql`
      update pending_registrations set
        status = 'rejected', resolved_at = now(), resolved_by = ${session.id},
        reject_reason = ${reason || null}, payment_screenshot = null
      where id = ${pendingId} and status = 'pending'`;

    res.status(200).json({ ok: true });
  }catch(err){
    console.error('pending-reject error:', err);
    res.status(500).json({ error: err.message || 'Server error rejecting request' });
  }
}
