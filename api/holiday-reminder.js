// api/holiday-reminder.js  –  Pure CommonJS + Firebase Admin SDK
// Sends holiday reminder emails to all active employees who have an employeeId.
// Triggered by Vercel Cron (daily at 10 AM IST) or manually from Admin Panel.
//
// Required Vercel Environment Variables:
//   FIREBASE_SERVICE_ACCOUNT — Full JSON from the downloaded service account key file
//   ZOHO_EMAIL               — Zoho Mail address to send from
//   ZOHO_PASSWORD            — Zoho account/app password
//   CRON_SECRET              — secret string to protect this endpoint

var admin = require('firebase-admin');
var nodemailer = require('nodemailer');

// ─── Firebase Admin init (bypasses Firestore security rules) ─────────────────
function getAdminApp() {
  if (admin.apps.length > 0) return admin.apps[0];
  var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// ─── Holiday list (keep in sync with LeaveCalendar.tsx) ──────────────────────
var NATIONAL_HOLIDAYS = [
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

// ─── Email HTML template ─────────────────────────────────────────────────────
function buildEmailHtml(name, holidayName, dateStr) {
  var formatted = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">' +
    '<tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">' +
    '<tr><td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:36px 40px;text-align:center;">' +
    '<div style="font-size:48px;margin-bottom:8px;">&#127881;</div>' +
    '<h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Holiday Tomorrow!</h1>' +
    '</td></tr>' +
    '<tr><td style="padding:40px;">' +
    '<p style="font-size:16px;color:#334155;margin:0 0 16px;">Hi <strong>' + name + '</strong>,</p>' +
    '<p style="font-size:16px;color:#334155;margin:0 0 24px;">Just a quick reminder — tomorrow is a public holiday. Enjoy your well-deserved day off! &#127958;</p>' +
    '<div style="background:#f0f7ff;border-left:4px solid #2563eb;border-radius:8px;padding:20px 24px;margin:0 0 28px;">' +
    '<div style="font-size:13px;font-weight:600;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Tomorrow\'s Holiday</div>' +
    '<div style="font-size:24px;font-weight:700;color:#1e40af;margin-bottom:4px;">' + holidayName + '</div>' +
    '<div style="font-size:15px;color:#475569;">' + formatted + '</div>' +
    '</div>' +
    '<p style="font-size:14px;color:#94a3b8;margin:0;border-top:1px solid #e2e8f0;padding-top:20px;">' +
    'This is an automated reminder from <strong>LAMS – Leave &amp; Attendance Management System</strong>.</p>' +
    '</td></tr>' +
    '</table>' +
    '</td></tr></table>' +
    '</body></html>';
}

// ─── Main handler ────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).end();
    }

    // Auth
    var authHeader = req.headers['authorization'] || '';
    var cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    var body = req.body || {};
    var force = req.query.force === 'true' || body.force === true;
    var testEmail = req.query.testEmail || body.testEmail || null;

    // Tomorrow in IST
    var nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    var tomorrow = new Date(nowIST);
    tomorrow.setDate(tomorrow.getDate() + 1);
    var tomorrowStr = tomorrow.toISOString().split('T')[0];

    var holiday = NATIONAL_HOLIDAYS.find(function (h) { return h.date === tomorrowStr; });

    if (!holiday && !force) {
      return res.status(200).json({
        ok: true,
        message: 'No holiday on ' + tomorrowStr + '. Nothing sent.',
      });
    }

    var effectiveHoliday = holiday || { name: 'Test Reminder', date: tomorrowStr };

    // Fetch employees using Admin SDK (bypasses Firestore rules)
    var employees = [];
    try {
      var app = getAdminApp();
      var db = admin.firestore(app);
      var snapshot = await db.collection('users').where('isActive', '==', true).get();
      snapshot.forEach(function (doc) {
        var data = doc.data();
        if (data.employeeId && data.email) {
          employees.push({ uid: doc.id, name: data.name, email: data.email, employeeId: data.employeeId });
        }
      });
    } catch (err) {
      console.error('Firestore fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch employees', detail: err.message });
    }

    if (employees.length === 0) {
      return res.status(200).json({ ok: true, message: 'No active employees with Employee ID found.' });
    }

    // Filter for test
    var recipients = testEmail
      ? employees.filter(function (e) { return e.email === testEmail; })
      : employees;

    var finalRecipients = (testEmail && recipients.length === 0)
      ? [{ name: 'Admin', email: testEmail, employeeId: 'TEST' }]
      : recipients;

    // Zoho SMTP
    var zohoEmail = process.env.ZOHO_EMAIL;
    var zohoPass  = process.env.ZOHO_PASSWORD;
    if (!zohoEmail || !zohoPass) {
      return res.status(500).json({ error: 'ZOHO_EMAIL or ZOHO_PASSWORD not configured.' });
    }

    var smtpHost = process.env.ZOHO_SMTP_HOST || 'smtppro.zoho.com';
    var transporter = nodemailer.createTransport({
      host: smtpHost,
      port: 465,
      secure: true,
      auth: { user: zohoEmail, pass: zohoPass },
    });

    // Send emails
    var sent = [];
    var errors = [];

    for (var i = 0; i < finalRecipients.length; i++) {
      var emp = finalRecipients[i];
      try {
        await transporter.sendMail({
          from: '"LAMS - Leave Portal" <' + zohoEmail + '>',
          to: emp.email,
          subject: 'Holiday Tomorrow: ' + effectiveHoliday.name,
          html: buildEmailHtml(emp.name || 'there', effectiveHoliday.name, effectiveHoliday.date),
        });
        sent.push(emp.email);
      } catch (err) {
        console.error('Failed to send to ' + emp.email + ':', err);
        errors.push({ email: emp.email, error: err.message });
      }
    }

    return res.status(200).json({
      ok: true,
      holiday: effectiveHoliday.name,
      date: effectiveHoliday.date,
      sent: sent.length,
      sentTo: sent,
      errors: errors,
    });
  } catch (err) {
    console.error('holiday-reminder unhandled error:', err);
    return res.status(500).json({ error: 'Unhandled error', detail: err.message });
  }
};
