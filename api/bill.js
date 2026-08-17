import { sql, toDateStr } from '../lib/db.js';
import { verifyBillToken } from '../lib/billToken.js';

function errorPage(message){
  return `<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vidyabhyasa</title></head>
<body style="font-family:sans-serif;background:#FBF8F2;color:#16324F;padding:60px 24px;text-align:center;">
  <h2>${message}</h2>
  <p style="color:#7C7566;font-size:14px;">Please ask the center staff for a fresh link.</p>
</body></html>`;
}

export default async function handler(req, res){
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (req.method !== 'GET') return res.status(405).send(errorPage('Method not allowed'));

  const { token } = req.query;
  const studentId = token ? verifyBillToken(token) : null;
  if (!studentId) return res.status(400).send(errorPage('This link is invalid or has expired.'));

  try{
    const rows = await sql`
      select name, phone, email, exam_prep as "examPrep",
             to_char(join_date, 'YYYY-MM-DD') as "joinDate",
             duration_months as "durationMonths",
             to_char(expiry_date, 'YYYY-MM-DD') as "expiryDate",
             seat_id as "seatId", locker_id as "lockerId",
             locker_months as "lockerMonths",
             to_char(locker_expiry_date, 'YYYY-MM-DD') as "lockerExpiryDate"
      from students where id = ${studentId}`;
    const student = rows[0];
    if (!student) return res.status(404).send(errorPage('This booking could not be found.'));

    const payments = await sql`
      select to_char(date, 'YYYY-MM-DD') as date, amount, note, payment_method as "paymentMethod"
      from payments where student_id = ${studentId} order by date asc`;
    const totalPaid = payments.reduce((a,p)=>a+Number(p.amount), 0);

    const paymentRows = payments.map(p => `
      <tr>
        <td style="padding:8px 0;color:#7C7566;">${p.date}</td>
        <td style="padding:8px 0;">${p.note || ''}<br><span style="font-size:11px;color:#7C7566;text-transform:uppercase;">${p.paymentMethod || 'upi'}</span></td>
        <td style="padding:8px 0;text-align:right;font-weight:600;">₹${p.amount}</td>
      </tr>`).join('');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vidyabhyasa — Bill</title>
  <link rel="icon" type="image/png" href="/favicon.png">
  <style>
    body{font-family:-apple-system,sans-serif;background:#FBF8F2;color:#16324F;margin:0;padding:24px 16px;}
    .card{max-width:480px;margin:0 auto;background:#fff;border:1px solid #E4DFD1;border-radius:14px;padding:28px 24px;}
    .logo{display:block;width:64px;height:64px;border-radius:10px;margin:0 auto 12px;object-fit:cover;}
    h1{text-align:center;font-size:20px;margin:0 0 4px;}
    .sub{text-align:center;color:#7C7566;font-size:13px;margin-bottom:20px;}
    .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #E4DFD1;font-size:14px;}
    .row span:first-child{color:#7C7566;}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;}
    .total{font-weight:700;font-size:17px;padding-top:14px;border-top:2px solid #16324F;margin-top:8px;display:flex;justify-content:space-between;}
  </style>
</head>
<body>
  <div class="card">
    <img class="logo" src="/logo.jpeg" alt="Vidyabhyasa">
    <h1>Vidyabhyasa Study Center</h1>
    <p class="sub">Bill for ${student.name}</p>
    <div class="row"><span>Seat</span><span>${student.seatId}</span></div>
    ${student.lockerId ? `<div class="row"><span>Locker</span><span>${student.lockerId}</span></div>` : ''}
    <div class="row"><span>Exam</span><span>${student.examPrep}</span></div>
    <div class="row"><span>Joined</span><span>${student.joinDate}</span></div>
    <div class="row"><span>Seat valid until</span><span>${student.expiryDate}</span></div>
    ${student.lockerExpiryDate ? `<div class="row"><span>Locker valid until</span><span>${student.lockerExpiryDate}</span></div>` : ''}
    <h3 style="font-size:14px;margin:20px 0 4px;">Payment history</h3>
    <table>${paymentRows || '<tr><td style="padding:8px 0;color:#7C7566;">No payments on record.</td></tr>'}</table>
    <div class="total"><span>Total paid</span><span>₹${totalPaid}</span></div>
    <p style="text-align:center;color:#7C7566;font-size:11px;margin-top:20px;">This is your digital receipt — no action needed.</p>
  </div>
</body>
</html>`;

    res.status(200).send(html);
  }catch(err){
    console.error('bill page error:', err);
    res.status(500).send(errorPage('Something went wrong loading this bill.'));
  }
}
