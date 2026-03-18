// api/holiday-reminder.js
// Sends holiday reminder emails to all active employees who have an employeeId.
// Triggered automatically by Vercel Cron (daily at 10 AM IST / 4:30 AM UTC).
// Can also be triggered manually from the Admin Panel.
//
// Required Vercel Environment Variables:
//   REACT_APP_FIREBASE_API_KEY, REACT_APP_FIREBASE_AUTH_DOMAIN,
//   REACT_APP_FIREBASE_PROJECT_ID, REACT_APP_FIREBASE_STORAGE_BUCKET,
//   REACT_APP_FIREBASE_MESSAGING_SENDER_ID, REACT_APP_FIREBASE_APP_ID
//   ZOHO_EMAIL            — Zoho Mail address to send from (e.g. hr@getmorph.com)
//   ZOHO_PASSWORD         — Zoho account password or App Password (if 2FA is on)
//   CRON_SECRET           — Any random secret string; used to protect this endpoint

import nodemailer from 'nodemailer';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

// ─── Holiday list (keep in sync with src/components/Calendar/LeaveCalendar.tsx) ─────
const NATIONAL_HOLIDAYS = [
  { date: '2026-01-01', name: 'New Year' },
  { date: '2026-01-15', name: 'Makara Sankranti' },
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-03-04', name: 'Holi' },
  { date: '2026-03-19', name: 'Ugadi' },
  { date: '2026-03-26', name: 'Ram Navami' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-28', name: 'Bakrid' },
  { date: '2026-06-26', name: 'Last day of Muharram' },
  { date: '2026-08-26', name: 'Eid-Milad' },
  { date: '2026-09-14', name: 'Ganesh Chaturthi' },
  { date: '2026-10-02', name: 'Gandhi Jayanthi' },
  { date: '2026-10-20', name: 'Ayudha Pooja' },
  { date: '2026-10-21', name: 'Vijayadashami' },
  { date: '2026-11-09', name: 'Deepavali' },
  { date: '2026-11-10', name: 'Deepavali' },
  { date: '2026-12-24', name: 'Christmas Eve' },
  { date: '2026-12-25', name: 'Christmas' },
];

// ─── Firebase JS SDK (same pattern as slack-interact.js) ─────────────────────
function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.REACT_APP_FIREBASE_APP_ID,
  });
}

// ─── Email HTML template ──────────────────────────────────────────────────────
function buildEmailHtml(name, holidayName, dateStr) {
  const formatted = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:36px 40px;text-align:center;">
            <div style="font-size:48px;margin-bottom:8px;">🎉</div>
            <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Holiday Tomorrow!</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="font-size:16px;color:#334155;margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
            <p style="font-size:16px;color:#334155;margin:0 0 24px;">
              Just a quick reminder — tomorrow is a public holiday. Enjoy your well-deserved day off! 🏖️
            </p>
            <!-- Holiday Card -->
            <div style="background:#f0f7ff;border-left:4px solid #2563eb;border-radius:8px;padding:20px 24px;margin:0 0 28px;">
              <div style="font-size:13px;font-weight:600;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Tomorrow's Holiday</div>
              <div style="font-size:24px;font-weight:700;color:#1e40af;margin-bottom:4px;">${holidayName}</div>
              <div style="font-size:15px;color:#475569;">${formatted}</div>
            </div>
            <p style="font-size:14px;color:#94a3b8;margin:0;border-top:1px solid #e2e8f0;padding-top:20px;">
              This is an automated reminder from <strong>LAMS – Leave &amp; Attendance Management System</strong>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end();
  }

  // ── Auth: accept Vercel cron header OR manual Bearer token ──────────────────
  const authHeader = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── Determine which holiday to use ──────────────────────────────────────────
  const body = req.body || {};

  // force=true → send regardless of holiday (for testing)
  const force = req.query.force === 'true' || body.force === true;

  // testEmail → send ONLY to this email (for admin test; uses all active employees otherwise)
  const testEmail = req.query.testEmail || body.testEmail || null;

  // Compute tomorrow in YYYY-MM-DD (IST offset +05:30)
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const tomorrow = new Date(nowIST);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const holiday = NATIONAL_HOLIDAYS.find(h => h.date === tomorrowStr);

  if (!holiday && !force) {
    return res.status(200).json({
      ok: true,
      message: `No holiday on ${tomorrowStr}. Nothing sent.`,
    });
  }

  const effectiveHoliday = holiday || { name: 'Test Reminder', date: tomorrowStr };

  // ── Fetch employees with employeeId from Firestore ───────────────────────────
  let employees = [];
  try {
    const app = getFirebaseApp();
    const db = getFirestore(app);
    const snapshot = await getDocs(
      query(collection(db, 'users'), where('isActive', '==', true))
    );
    employees = snapshot.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .filter(u => u.employeeId && u.email);
  } catch (err) {
    console.error('Firestore fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch employees', detail: err.message });
  }

  if (employees.length === 0) {
    return res.status(200).json({ ok: true, message: 'No active employees with Employee ID found.' });
  }

  // ── Apply testEmail filter if provided ──────────────────────────────────────
  const recipients = testEmail
    ? employees.filter(e => e.email === testEmail)
    : employees;

  // If testEmail was specified but not found in the employees list,
  // send directly to that email as a standalone test
  const finalRecipients =
    testEmail && recipients.length === 0
      ? [{ name: 'Admin', email: testEmail, employeeId: 'TEST' }]
      : recipients;

  // ── Send via Zoho SMTP ───────────────────────────────────────────────────────
  const zohoEmail = process.env.ZOHO_EMAIL;
  const zohoPass  = process.env.ZOHO_PASSWORD;
  if (!zohoEmail || !zohoPass) {
    return res.status(500).json({ error: 'ZOHO_EMAIL or ZOHO_PASSWORD not configured.' });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtppro.zoho.in',   // use smtppro.zoho.com if your Zoho domain is .com
    port: 465,
    secure: true,
    auth: { user: zohoEmail, pass: zohoPass },
  });

  // ── Send emails ──────────────────────────────────────────────────────────────
  const sent = [];
  const errors = [];

  for (const emp of finalRecipients) {
    try {
      await transporter.sendMail({
        from: `"LAMS – Leave Portal" <${zohoEmail}>`,
        to: emp.email,
        subject: `🎉 Holiday Tomorrow: ${effectiveHoliday.name}`,
        html: buildEmailHtml(emp.name || 'there', effectiveHoliday.name, effectiveHoliday.date),
      });
      sent.push(emp.email);
    } catch (err) {
      console.error(`Failed to send to ${emp.email}:`, err);
      errors.push({ email: emp.email, error: err.message });
    }
  }

  return res.status(200).json({
    ok: true,
    holiday: effectiveHoliday.name,
    date: effectiveHoliday.date,
    sent: sent.length,
    sentTo: sent,
    errors,
  });
}
