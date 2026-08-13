import jwt from 'jsonwebtoken';
import cookie from 'cookie';

const COOKIE_NAME = 'vidya_session';

function secret(){
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return process.env.JWT_SECRET;
}

export function setSessionCookie(res, payload){
  const token = jwt.sign(payload, secret(), { expiresIn: '12h' });
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12
  }));
}

export function clearSessionCookie(res){
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  }));
}

export function getSession(req){
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try{
    return jwt.verify(token, secret());
  }catch(e){
    return null;
  }
}

export function requireStaff(req, res){
  const session = getSession(req);
  if (!session){
    res.status(401).json({ error: 'Not signed in' });
    return null;
  }
  return session;
}
