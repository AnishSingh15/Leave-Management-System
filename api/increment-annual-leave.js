// api/increment-annual-leave.js
// Adds 2 annual leave days to every active employee at the start of each month.
// Triggered by Vercel Cron (1st of every month at 12:00 AM IST = 6:30 PM UTC prev day)
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

    var app = getAdminApp();
    var db = admin.firestore(app);

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

    await batch.commit();

    var nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    console.log('[increment-annual-leave] Ran at ' + nowIST.toISOString() + ' IST. Updated ' + updatedUsers.length + ' users.');

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
