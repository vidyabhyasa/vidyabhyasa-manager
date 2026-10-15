import { sql } from './db.js';

// Works out which branch an audit entry belongs to from its target, unless
// the caller passes branchId explicitly (needed when the target was just deleted).
async function branchFor(targetType, targetId){
  if (!targetId) return null;
  try{
    let rows = [];
    if (targetType === 'student') rows = await sql`select branch_id from students where id = ${targetId}`;
    else if (targetType === 'pending') rows = await sql`select branch_id from pending_registrations where id = ${targetId}`;
    else if (targetType === 'payment') rows = await sql`select s.branch_id from payments p join students s on s.id = p.student_id where p.id = ${targetId}`;
    return rows[0] ? rows[0].branch_id : null;
  }catch(e){ return null; }
}

export async function logAudit({ actorId, actorName, action, targetType, targetId, details, branchId }){
  try{
    const branch = branchId || await branchFor(targetType, targetId);
    await sql`
      insert into audit_log (actor_id, actor_name, action, target_type, target_id, details, branch_id)
      values (${actorId || null}, ${actorName || null}, ${action}, ${targetType || null}, ${targetId || null}, ${details || null}, ${branch})`;
  }catch(err){
    // Never let a logging failure break the actual action.
    console.error('audit log write failed:', err);
  }
}
