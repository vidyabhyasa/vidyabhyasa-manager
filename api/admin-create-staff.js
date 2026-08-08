import { sql } from './_db.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { secret, email, password, role, displayName } = req.body || {};

  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET){
    return res.status(401).json({ error: 'Invalid setup secret' });
  }
  if (!email || !password || !role || !displayName){
    return res.status(400).json({ error: 'email, password, role, and displayName are all required' });
  }
  if (!['manager', 'founder'].includes(role)){
    return res.status(400).json({ error: "role must be 'manager' or 'founder'" });
  }

  const hash = await bcrypt.hash(password, 10);
  await sql`
    insert into staff (email, password_hash, role, display_name)
    values (${email}, ${hash}, ${role}, ${displayName})
    on conflict (email) do update set
      password_hash = excluded.password_hash,
      role = excluded.role,
      display_name = excluded.display_name`;

  res.status(200).json({ ok: true });
}
