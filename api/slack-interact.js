// Handles Slack interactive button clicks (Approve / Reject from DMs)
// Slack sends a POST with application/x-www-form-urlencoded body containing a "payload" JSON string

import crypto from 'crypto';

// ─── Firebase setup for serverless ───────────────────────────────────────────
// Using the Firebase JS SDK (works in Node.js serverless functions)
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, doc, getDoc, updateDoc, getDocs,
  query, where, collection, runTransaction, Timestamp
} from 'firebase/firestore';

function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
  });
}

// ─── Slack signature verification ────────────────────────────────────────────
function verifySlackSignature(signingSecret, signature, timestamp, body) {
  if (!signingSecret) return true; // Skip if not configured
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');
  const expected = `v0=${hmac}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
}

// ─── Send a DM using bot token ───────────────────────────────────────────────
async function sendDM(botToken, slackUserId, blocks, text) {
  if (!botToken || !slackUserId) return;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${botToken}`
    },
    body: JSON.stringify({
      channel: slackUserId,
      blocks,
      text: text || 'LAMS Notification'
    })
  });
}

// ─── Build a notification block ──────────────────────────────────────────────
function buildNotifBlocks(emoji, title, details) {
  let text = `${emoji}  *${title}*\n\n`;
  for (const [key, val] of Object.entries(details)) {
    if (val) text += `${key}:  ${val}\n`;
  }
  return [
    { type: 'section', text: { type: 'mrkdwn', text } },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `LAMS  •  ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` }]
    },
    { type: 'divider' }
  ];
}

// ─── Get HR admin Slack IDs ──────────────────────────────────────────────────
async function getHRSlackIds(db) {
  const q = query(collection(db, 'users'), where('role', '==', 'hr_admin'));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data().slackMemberId).filter(Boolean);
}

// ─── Main handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const botToken = process.env.SLACK_BOT_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  // Slack sends the body as application/x-www-form-urlencoded with a "payload" field
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  // Verify Slack signature
  try {
    const slackSignature = req.headers['x-slack-signature'];
    const slackTimestamp = req.headers['x-slack-request-timestamp'];

    // Prevent replay attacks (5 min window)
    if (Math.abs(Date.now() / 1000 - Number(slackTimestamp)) > 300) {
      return res.status(403).json({ error: 'Request too old' });
    }

    if (signingSecret && !verifySlackSignature(signingSecret, slackSignature, slackTimestamp, rawBody)) {
      return res.status(403).json({ error: 'Invalid signature' });
    }
  } catch (e) {
    // If verification fails, log but continue (might not have signing secret)
    console.warn('Signature verification skipped:', e.message);
  }

  try {
    // Parse the payload
    const payloadStr = req.body?.payload || (typeof req.body === 'string' ? req.body : null);
    if (!payloadStr) {
      return res.status(400).json({ error: 'No payload' });
    }

    const payload = JSON.parse(payloadStr);

    if (payload.type !== 'block_actions') {
      return res.status(200).json({ ok: true });
    }

    const action = payload.actions?.[0];
    if (!action) return res.status(200).json({ ok: true });

    const actionData = JSON.parse(action.value);
    const { leaveId, action: decision, type: approvalType } = actionData;
    const slackUserId = payload.user?.id;
    const slackUserName = payload.user?.name || payload.user?.real_name || 'Slack User';
    const responseUrl = payload.response_url;

    // Initialize Firebase
    const app = getFirebaseApp();
    const db = getFirestore(app);

    // Get the leave request
    const leaveRef = doc(db, 'leaves', leaveId);
    const leaveSnap = await getDoc(leaveRef);

    if (!leaveSnap.exists()) {
      await updateSlackMessage(responseUrl, '⚠️  Leave request not found.');
      return res.status(200).json({ ok: true });
    }

    const leave = leaveSnap.data();
    const isApprove = decision === 'approve';

    // Verify the clicking user is the right person
    // (Check their slackMemberId matches a user with the right role)
    const usersQuery = query(collection(db, 'users'), where('slackMemberId', '==', slackUserId));
    const userSnap = await getDocs(usersQuery);

    if (userSnap.empty) {
      await updateSlackMessage(responseUrl, '⚠️  Your Slack ID is not linked to any LAMS account. Ask HR to set your Slack Member ID in the Admin Panel.');
      return res.status(200).json({ ok: true });
    }

    const actingUser = userSnap.docs[0].data();
    const actingUserId = userSnap.docs[0].id;

    // ─── MANAGER DECISION ────────────────────────────────────────────
    if (approvalType === 'manager') {
      // Verify this user is the assigned manager
      if (leave.managerId !== actingUserId) {
        await updateSlackMessage(responseUrl, '⚠️  You are not the assigned manager for this leave request.');
        return res.status(200).json({ ok: true });
      }

      if (leave.status !== 'pending_manager') {
        await updateSlackMessage(responseUrl, `⚠️  This leave has already been processed. Current status: ${leave.status}`);
        return res.status(200).json({ ok: true });
      }

      const newStatus = isApprove ? 'pending_hr' : 'rejected';
      const comment = isApprove ? 'Approved via Slack' : 'Rejected via Slack';

      await updateDoc(leaveRef, {
        status: newStatus,
        managerComment: comment,
        updatedAt: Timestamp.now()
      });

      // Update the original Slack message
      const resultEmoji = isApprove ? '✅' : '❌';
      const resultText = isApprove ? 'Approved by Manager — Forwarded to HR' : 'Rejected by Manager';
      await updateSlackMessage(responseUrl,
        `${resultEmoji}  *${resultText}*\n\n` +
        `👤 *Employee:* ${leave.employeeName}\n` +
        `📋 *Type:* ${leave.leaveType?.replace(/_/g, ' ')}\n` +
        `📅 *Dates:* ${formatDate(leave.startDate)} → ${formatDate(leave.endDate)}\n` +
        `💬 *Comment:* ${comment}\n` +
        `👔 *Decided by:* ${actingUser.name}`
      );

      // If approved → DM all HR admins with Approve/Reject buttons
      if (isApprove) {
        const hrSlackIds = await getHRSlackIds(db);
        const hrBlocks = buildNotifBlocks('🟠', 'Leave Request — Pending HR Approval', {
          '👤  *Employee*': leave.employeeName,
          '📋  *Type*': leave.leaveType?.replace(/_/g, ' '),
          '📅  *Dates*': `${formatDate(leave.startDate)} → ${formatDate(leave.endDate)}`,
          '🔢  *Days*': leave.totalDays,
          '👔  *Manager*': actingUser.name,
          '💬  *Manager Comment*': comment
        });

        // Add link to LAMS approvals page for HR
        const lamsUrl = 'https://leave-management-system-nine-chi.vercel.app/approvals';
        hrBlocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `👉  *<${lamsUrl}|Open LAMS to Approve / Reject>*`
          }
        });

        for (const hrId of hrSlackIds) {
          await sendDM(botToken, hrId, hrBlocks, `Leave pending HR approval: ${leave.employeeName}`);
        }
      } else {
        // Rejected → DM the employee
        const empDoc = await getDoc(doc(db, 'users', leave.employeeId));
        const empSlackId = empDoc.exists() ? empDoc.data().slackMemberId : null;
        if (empSlackId) {
          const empBlocks = buildNotifBlocks('🔴', 'Leave Request — Rejected by Manager', {
            '📋  *Type*': leave.leaveType?.replace(/_/g, ' '),
            '📅  *Dates*': `${formatDate(leave.startDate)} → ${formatDate(leave.endDate)}`,
            '👔  *Manager*': actingUser.name,
            '💬  *Comment*': comment
          });
          await sendDM(botToken, empSlackId, empBlocks, 'Your leave request was rejected');
        }
      }

      return res.status(200).json({ ok: true });
    }

    // ─── HR DECISION ─────────────────────────────────────────────────
    if (approvalType === 'hr') {
      if (actingUser.role !== 'hr_admin') {
        await updateSlackMessage(responseUrl, '⚠️  Only HR admins can process this approval.');
        return res.status(200).json({ ok: true });
      }

      if (leave.status !== 'pending_hr') {
        await updateSlackMessage(responseUrl, `⚠️  This leave has already been processed. Current status: ${leave.status}`);
        return res.status(200).json({ ok: true });
      }

      const comment = isApprove ? 'Approved via Slack' : 'Rejected via Slack';

      if (!isApprove) {
        // HR Rejection — simple update
        await updateDoc(leaveRef, {
          status: 'rejected',
          hrComment: comment,
          updatedAt: Timestamp.now()
        });
      } else {
        // HR Approval — handle balance deduction via transaction
        await runTransaction(db, async (transaction) => {
          const freshLeave = await transaction.get(leaveRef);
          if (!freshLeave.exists()) throw new Error('Leave not found');
          const ld = freshLeave.data();

          // WFH, Menstrual, Bereavement — no deduction
          if (['wfh', 'menstrual', 'bereavement'].includes(ld.leaveType)) {
            transaction.update(leaveRef, {
              status: 'approved',
              hrComment: comment,
              updatedAt: Timestamp.now()
            });
            return;
          }

          // Extra Work — credit comp-off
          if (ld.leaveType === 'extra_work') {
            const empRef = doc(db, 'users', ld.employeeId);
            const empSnap = await transaction.get(empRef);
            if (empSnap.exists()) {
              transaction.update(empRef, {
                compOffBalance: (empSnap.data().compOffBalance || 0) + ld.totalDays,
                updatedAt: Timestamp.now()
              });
            }
            transaction.update(leaveRef, {
              status: 'approved',
              hrComment: comment,
              updatedAt: Timestamp.now()
            });
            return;
          }

          // Standard leave — deduct balances
          const empRef = doc(db, 'users', ld.employeeId);
          const empSnap = await transaction.get(empRef);
          if (!empSnap.exists()) throw new Error('Employee not found');

          const emp = empSnap.data();
          let compOffUsed = 0;
          let annualLeaveUsed = 0;
          let remaining = ld.totalDays;

          if (ld.selectedSources?.compOff && emp.compOffBalance > 0) {
            compOffUsed = Math.min(emp.compOffBalance, remaining);
            remaining -= compOffUsed;
          }
          if (ld.selectedSources?.annualLeave && remaining > 0) {
            annualLeaveUsed = Math.min(emp.annualLeaveBalance, remaining);
            remaining -= annualLeaveUsed;
          }

          transaction.update(empRef, {
            compOffBalance: emp.compOffBalance - compOffUsed,
            annualLeaveBalance: emp.annualLeaveBalance - annualLeaveUsed,
            updatedAt: Timestamp.now()
          });

          transaction.update(leaveRef, {
            status: 'approved',
            hrComment: comment,
            compOffUsed,
            annualLeaveUsed,
            updatedAt: Timestamp.now()
          });
        });
      }

      // Update the original Slack message
      const resultEmoji = isApprove ? '🟢' : '🔴';
      const resultText = isApprove ? 'Approved by HR' : 'Rejected by HR';
      await updateSlackMessage(responseUrl,
        `${resultEmoji}  *Leave Request — ${resultText}*\n\n` +
        `👤 *Employee:* ${leave.employeeName}\n` +
        `📋 *Type:* ${leave.leaveType?.replace(/_/g, ' ')}\n` +
        `📅 *Dates:* ${formatDate(leave.startDate)} → ${formatDate(leave.endDate)}\n` +
        `💬 *HR Comment:* ${comment}\n` +
        `🏢 *Decided by:* ${actingUser.name}`
      );

      // DM the employee about the result
      const empDoc = await getDoc(doc(db, 'users', leave.employeeId));
      const empSlackId = empDoc.exists() ? empDoc.data().slackMemberId : null;
      if (empSlackId) {
        const emoji = isApprove ? '🟢' : '🔴';
        const empBlocks = buildNotifBlocks(emoji, `Leave Request — ${resultText}`, {
          '📋  *Type*': leave.leaveType?.replace(/_/g, ' '),
          '📅  *Dates*': `${formatDate(leave.startDate)} → ${formatDate(leave.endDate)}`,
          '🏢  *HR*': actingUser.name,
          '💬  *Comment*': comment
        });
        await sendDM(botToken, empSlackId, empBlocks, `Your leave has been ${isApprove ? 'approved' : 'rejected'}`);
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Slack interact error:', error);
    return res.status(200).json({ error: error.message }); // 200 to prevent Slack retries
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Update the original Slack message (replace buttons with result)
async function updateSlackMessage(responseUrl, text) {
  if (!responseUrl) return;
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      replace_original: true,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text } },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `LAMS  •  ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
          }]
        },
        { type: 'divider' }
      ]
    })
  });
}

// Format Firestore Timestamp to date string
function formatDate(ts) {
  if (!ts) return '?';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split('T')[0];
}
