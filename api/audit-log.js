import { sql } from '../lib/db.js';
import { requireStaff } from '../lib/auth.js';

export default async function handler(req, res){
  const session = requireStaff(req, res);
  if (!session) return;
  if (session.role !== 'founder') return res.status(403).json({ error: 'Founder access only' });

  try{
    const rows = await sql`
      select id, actor_name as "actorName", action, target_type as "targetType",
             target_id as "targetId", details, created_at as "createdAt"
      from audit_log
      order by created_at desc
      limit 300`;
    res.status(200).json({ entries: rows });
  }catch(err){
    console.error('audit-log error:', err);
    res.status(500).json({ error: err.message || 'Server error loading audit log' });
  }
}
