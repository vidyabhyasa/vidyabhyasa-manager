import { sql } from './_db.js';
import bcrypt from 'bcryptjs';
import { setSessionCookie } from './_auth.js';

export default async function handler(req, res){
  try{
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const rows = await sql`select id, password_hash, role, display_name from staff where email = ${email}`;
    const staff = rows[0];
    if (!staff) return res.status(401).json({ error: 'Incorrect email or password' });

    const ok = await bcrypt.compare(password, staff.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });

    setSessionCookie(res, { id: staff.id, role: staff.role, label: staff.display_name });
    res.status(200).json({ role: staff.role, label: staff.display_name });
  }catch(err){
    console.error('login error:', err);
    res.status(500).json({ error: err.message || 'Server error during login' });
  }
}
