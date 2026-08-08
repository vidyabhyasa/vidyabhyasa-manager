import { sql } from './_db.js';
import { requireStaff } from './_auth.js';

export default async function handler(req, res){
  const session = requireStaff(req, res);
  if (!session) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { studentId } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });

  await sql`delete from students where id = ${studentId}`;
  res.status(200).json({ ok: true });
}
