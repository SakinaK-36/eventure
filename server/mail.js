import nodemailer from 'nodemailer'; import QRCode from 'qrcode';

const { SMTP_HOST, SMTP_PORT = '587', SMTP_USER, SMTP_PASS } = process.env;
const FROM = process.env.MAIL_FROM || 'Eventure <no-reply@eventure.local>';
const tx = SMTP_HOST && nodemailer.createTransport({ host: SMTP_HOST, port: +SMTP_PORT, secure: SMTP_PORT === '465', auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined });
if (!tx) console.log('Email is off (no SMTP_HOST set). Messages will be printed here instead.');

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const date = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const money = n => '₹' + Number(n).toLocaleString('en-IN');

async function send(to, subject, html, attachments = []) {
  if (!tx) return console.log(`[email off] To: ${to} | ${subject}`);
  try { await tx.sendMail({ from: FROM, to, subject, html, attachments }); } catch (e) { console.error('Email failed:', e.message); }
}

export async function bookingMail(kind, b) {
  const details = `<p><b>${esc(b.event_name)}</b><br>${date(b.event_date)}${b.event_time ? ' at ' + esc(b.event_time) : ''}${b.event_venue ? '<br>' + esc(b.event_venue) : ''}<br>${b.seats} seat(s) · ${money(b.amount)}<br>Ticket code: <code>${esc(b.ref)}</code></p>`;
  const hi = `<p>Hi ${esc(b.user_name)},</p>`;
  if (kind === 'requested')
    return send(b.user_email, `We got your booking request for ${b.event_name}`, `${hi}<p>Your request is in. We’ll email you as soon as the organiser reviews it.</p>${details}`);
  if (kind === 'rejected')
    return send(b.user_email, `Your booking for ${b.event_name} wasn’t approved`, `${hi}<p>Sorry, the organiser couldn’t approve this booking.</p>${details}<p>You’re welcome to browse other events.</p>`);
  if (kind === 'approved') {
    const qr = await QRCode.toBuffer(b.ref, { width: 240, margin: 2 });
    return send(b.user_email, `You’re in! Your ticket for ${b.event_name}`,
      `${hi}<p>Your booking is approved. Show this QR code at the entrance.</p>${details}<p><img src="cid:ticket-qr" width="200" alt="Ticket QR code"></p>`,
      [{ filename: 'ticket.png', content: qr, cid: 'ticket-qr' }]);
  }
}

export function replyMail(m, reply) {
  return send(m.user_email, `Re: ${m.subject}`,
    `<p>Hi ${esc(m.user_name)},</p><p>The organiser replied to your message${m.event_name ? ' about <b>' + esc(m.event_name) + '</b>' : ''}:</p><blockquote style="border-left:3px solid #a45fc2;margin:0;padding:4px 12px">${esc(reply).replace(/\n/g, '<br>')}</blockquote><p style="color:#777">Your original message: ${esc(m.body).replace(/\n/g, '<br>')}</p>`);
}

export function waitlistMail(w, e) {
  return send(w.user_email, `Seats opened up for ${e.name}!`,
    `<p>Hi ${esc(w.user_name)},</p><p>Good news! Seats have freed up for <b>${esc(e.name)}</b> on ${date(e.date)}.</p><p>Visit Eventure to book your seats before they sell out again.</p>`);
}