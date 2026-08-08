import { getSession } from './_auth.js';

export default async function handler(req, res){
  const session = getSession(req);
  if (!session) return res.status(200).json({ session: null });
  res.status(200).json({ session: { role: session.role, label: session.label } });
}
