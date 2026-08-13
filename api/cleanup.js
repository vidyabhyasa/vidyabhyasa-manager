import { sql } from '../lib/db.js';
import { requireStaff } from '../lib/auth.js';

export default async function handler(req, res){
  const session = requireStaff(req, res);
  if (!session) return;
  try{
    if (req.method === 'GET'){
      const rows = await sql`
        select id, resource_type as "resourceType", resource_id as "resourceId", floor, reason,
               flagged_at as "flaggedAt"
        from cleanup_flags
        where cleared_at is null
        order by flagged_at asc`;
      return res.status(200).json({ flags: rows });
    }
    if (req.method === 'POST'){
      const { flagId } = req.body || {};
      if (!flagId) return res.status(400).json({ error: 'flagId required' });
      await sql`update cleanup_flags set cleared_at = now(), cleared_by = ${session.id} where id = ${flagId}`;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  }catch(err){
    console.error('cleanup error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
}
