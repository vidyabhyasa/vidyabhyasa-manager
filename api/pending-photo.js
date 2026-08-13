import { sql } from './_db.js';
import { requireStaff } from './_auth.js';

export default async function handler(req, res){
  try{
    const session = requireStaff(req, res);
    if (!session) return;

    const { id, type } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const column = type === 'payment' ? 'payment_screenshot' : 'id_photo';
    const typeColumn = type === 'payment' ? 'payment_screenshot_type' : 'id_photo_type';

    const rows = await sql(
      `select ${column} as photo, ${typeColumn} as phototype from pending_registrations where id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row || !row.photo) return res.status(404).end();

    res.setHeader('Content-Type', row.phototype || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.status(200).send(Buffer.from(row.photo));
  }catch(err){
    console.error('pending-photo error:', err);
    res.status(500).json({ error: err.message || 'Server error loading photo' });
  }
}
