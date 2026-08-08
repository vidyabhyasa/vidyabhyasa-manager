import { sql } from './_db.js';
import { requireStaff } from './_auth.js';

export default async function handler(req, res){
  const session = requireStaff(req, res);
  if (!session) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  const rows = await sql`select id_photo, id_photo_type from students where id = ${id}`;
  const row = rows[0];
  if (!row || !row.id_photo) return res.status(404).end();

  res.setHeader('Content-Type', row.id_photo_type || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.status(200).send(Buffer.from(row.id_photo));
}
