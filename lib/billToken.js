import jwt from 'jsonwebtoken';

function secret(){
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return process.env.JWT_SECRET;
}

export function signBillToken(studentId){
  return jwt.sign({ studentId, purpose: 'bill' }, secret(), { expiresIn: '180d' });
}

export function verifyBillToken(token){
  try{
    const decoded = jwt.verify(token, secret());
    if (decoded.purpose !== 'bill' || !decoded.studentId) return null;
    return decoded.studentId;
  }catch(e){
    return null;
  }
}
