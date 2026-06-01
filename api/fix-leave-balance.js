// api/fix-leave-balance.js
// ONE-TIME FIX: Deducts a specified number of annual leave days from all active employees.
// Call with POST and body: { amount: 6, force: true }
// Protected by CRON_SECRET.

var admin = require('firebase-admin');

function getAdminApp() {
  if (admin.apps.length > 0) return admin.apps[0];
  var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'POST only' });
    }

    // Auth check
    var authHeader = req.headers['authorization'] || '';
    var cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    var body = req.body || {};
    var amount = Number(body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Provide a positive "amount" to deduct.' });
    }

    var app = getAdminApp();
    var db = admin.firestore(app);

    var snapshot = await db.collection('users').where('isActive', '==', true).get();

    if (snapshot.empty) {
      return res.status(200).json({ ok: true, message: 'No active users found.' });
    }

    var batch = db.batch();
    var updatedUsers = [];

    snapshot.forEach(function (doc) {
      var data = doc.data();
      var current = typeof data.annualLeaveBalance === 'number' ? data.annualLeaveBalance : 0;
      var newBalance = Math.max(current - amount, 0);

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

    return res.status(200).json({
      ok: true,
      message: 'Deducted ' + amount + ' annual leave days from ' + updatedUsers.length + ' employees.',
      updatedCount: updatedUsers.length,
      users: updatedUsers,
    });
  } catch (err) {
    console.error('[fix-leave-balance] Error:', err);
    return res.status(500).json({ error: 'Failed', detail: err.message });
  }
};
