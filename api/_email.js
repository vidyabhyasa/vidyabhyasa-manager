// Sends email via Resend's HTTP API. Requires RESEND_API_KEY and
// RESEND_FROM_EMAIL env vars (see SETUP.md). Best-effort: callers
// should not fail the whole request just because an email didn't
// send — log it and move on.
export async function sendEmail({ to, subject, html }){
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from){
    console.warn('sendEmail skipped: RESEND_API_KEY or RESEND_FROM_EMAIL not set');
    return { sent: false, reason: 'Email not configured' };
  }
  if (!to){
    return { sent: false, reason: 'No recipient email on file' };
  }
  try{
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, html })
    });
    if (!res.ok){
      const errText = await res.text().catch(()=> '');
      console.error('Resend error:', res.status, errText);
      return { sent: false, reason: 'Email provider error' };
    }
    return { sent: true };
  }catch(err){
    console.error('sendEmail error:', err);
    return { sent: false, reason: err.message };
  }
}

export function billEmailHTML({ name, seatId, lockerId, joinDate, expiryDate, lockerExpiryDate, durationMonths, amount }){
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="color:#16324F;">Vidyabhyasa Study Center</h2>
      <p>Hi ${name},</p>
      <p>Your registration has been approved. Here are your details:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#7C7566;">Seat</td><td style="padding:6px 0;text-align:right;">${seatId}</td></tr>
        ${lockerId ? `<tr><td style="padding:6px 0;color:#7C7566;">Locker</td><td style="padding:6px 0;text-align:right;">${lockerId}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#7C7566;">Subscription</td><td style="padding:6px 0;text-align:right;">${durationMonths} month(s)</td></tr>
        <tr><td style="padding:6px 0;color:#7C7566;">Joined</td><td style="padding:6px 0;text-align:right;">${joinDate}</td></tr>
        <tr><td style="padding:6px 0;color:#7C7566;">Seat valid until</td><td style="padding:6px 0;text-align:right;">${expiryDate}</td></tr>
        ${lockerExpiryDate ? `<tr><td style="padding:6px 0;color:#7C7566;">Locker valid until</td><td style="padding:6px 0;text-align:right;">${lockerExpiryDate}</td></tr>` : ''}
        <tr><td style="padding:10px 0 0;color:#7C7566;font-weight:bold;">Amount paid</td><td style="padding:10px 0 0;text-align:right;font-weight:bold;">₹${amount}</td></tr>
      </table>
      <p style="margin-top:20px;color:#7C7566;font-size:12px;">Please keep this email as your receipt. See you at the center!</p>
    </div>
  `;
}
