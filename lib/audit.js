import { sql } from './db.js';

export async function logAudit({ actorId, actorName, action, targetType, targetId, details }){
  try{
    await sql`
      insert into audit_log (actor_id, actor_name, action, target_type, target_id, details)
      values (${actorId || null}, ${actorName || null}, ${action}, ${targetType || null}, ${targetId || null}, ${details || null})`;
  }catch(err){
    // Never let a logging failure break the actual action.
    console.error('audit log write failed:', err);
  }
}
