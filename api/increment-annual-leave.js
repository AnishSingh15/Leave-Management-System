// api/increment-annual-leave.js
// Adds 2 annual leave days to every active employee on the 1st of each month (IST).
// Triggered by Vercel Cron daily at 6:30 PM UTC (= 12:00 AM IST next day).
// The handler checks if the current IST date is the 1st — skips otherwise.
// Also callable manually from the Admin Panel with a CRON_SECRET Bearer token.
//
// Required Vercel Environment Variables:
//   FIREBASE_SERVICE_ACCOUNT — Full JSON from service account key file
//   CRON_SECRET              — Secret to protect this endpoint

var admin = require('firebase-admin');

var INCREMENT = 2;
var MAX_BALANCE = 30; // Safety cap — won't go above this

function getAdminApp() {
  if (admin.apps.length > 0) return admin.apps[0];
  var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Get current date in IST
function getISTDate() {
  // Create a date string in IST using Intl
  var now = new Date();
  var istStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  return new Date(istStr);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).end();
    }

    // Auth check
    var authHeader = req.headers['authorization'] || '';
    var cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    var body = req.body || {};
    var force = req.query.force === 'true' || body.force === true;

    // Only run on the 1st of the month (IST) unless forced
    var istNow = getISTDate();
    var istDay = istNow.getDate();
    var istMonth = istNow.getMonth() + 1; // 1-based
    var istYear = istNow.getFullYear();

    if (!force && istDay !== 1) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        message: 'Not the 1st of the month in IST (current IST date: ' + istDay + '). Skipping.',
      });
    }

    var app = getAdminApp();
    var db = admin.firestore(app);

    // Idempotency check — prevent double-run for the same month
    var runId = 'increment-' + istYear + '-' + String(istMonth).padStart(2, '0');
    var runDoc = await db.collection('cronRuns').doc(runId).get();

    if (runDoc.exists && !force) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        message: 'Already ran for ' + runId + '. Skipping duplicate.',
      });
    }

    // Fetch all active users
    var snapshot = await db.collection('users').where('isActive', '==', true).get();

    if (snapshot.empty) {
      return res.status(200).json({ ok: true, message: 'No active users found.', updated: 0 });
    }

    // Batch update — increment each user's annualLeaveBalance by 2 (capped at MAX_BALANCE)
    var batch = db.batch();
    var updatedUsers = [];

    snapshot.forEach(function (doc) {
      var data = doc.data();
      var current = typeof data.annualLeaveBalance === 'number' ? data.annualLeaveBalance : 0;
      var newBalance = Math.min(current + INCREMENT, MAX_BALANCE);

      batch.update(doc.ref, {
        annualLeaveBalance: newBalance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      updatedUsers.push({
        uid: doc.id,
        name: data.name,
        before: current,
        after: newBalance,
      });
    });

    // Mark this month as done
    batch.set(db.collection('cronRuns').doc(runId), {
      ranAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedCount: updatedUsers.length,
      force: force,
    });

    await batch.commit();

    console.log('[increment-annual-leave] Ran at ' + istNow.toISOString() + ' IST. Updated ' + updatedUsers.length + ' users.');

    return res.status(200).json({
      ok: true,
      message: 'Annual leave incremented by ' + INCREMENT + ' for all active employees.',
      updatedCount: updatedUsers.length,
      users: updatedUsers,
    });
  } catch (err) {
    console.error('[increment-annual-leave] Error:', err);
    return res.status(500).json({ error: 'Failed to increment annual leave', detail: err.message });
  }
};
