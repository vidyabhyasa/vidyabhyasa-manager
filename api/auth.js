import { sql } from '../lib/db.js';
import bcrypt from 'bcryptjs';
import { setSessionCookie, clearSessionCookie, getSession } from '../lib/auth.js';

export default async function handler(req, res){
  const action = req.query.action;
  try{
    if (action === 'login') return await doLogin(req, res);
    if (action === 'logout') return await doLogout(req, res);
    if (action === 'me') return await doMe(req, res);
    if (action === 'admin-create-staff') return await doAdminCreateStaff(req, res);
    return res.status(400).json({ error: 'Unknown or missing action' });
  }catch(err){
    console.error('auth error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
}

async function doLogin(req, res){
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
}

async function doLogout(req, res){
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}

async function doMe(req, res){
  const session = getSession(req);
  if (!session) return res.status(200).json({ session: null });
  res.status(200).json({ session: { role: session.role, label: session.label } });
}

async function doAdminCreateStaff(req, res){
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
