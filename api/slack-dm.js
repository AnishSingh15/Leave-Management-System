// Sends Slack DM to specific users using Bot Token (chat.postMessage)
// Falls back to channel webhook if no targets provided

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) {
    // Fallback: try channel webhook if bot token not set
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks: req.body.blocks }),
        });
        return res.status(200).json({ ok: true, fallback: 'webhook' });
      } catch (err) {
        return res.status(502).json({ error: 'Webhook fallback failed' });
      }
    }
    return res.status(200).json({ warning: 'Slack not configured, skipping' });
  }

  const { blocks, targetSlackIds, leaveId, approvalType } = req.body;

  if (!targetSlackIds || targetSlackIds.length === 0) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'No target IDs' });
  }

  // Build the final blocks — add a link to the LAMS approvals page
  let finalBlocks = [...blocks];

  if (leaveId && approvalType) {
    const lamsUrl = 'https://leave-management-system-nine-chi.vercel.app/approvals';
    finalBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `👉  *<${lamsUrl}|Open LAMS to Approve / Reject>*`
      }
    });
  }

  // Send DM to each target user
  const results = [];
  for (const slackId of targetSlackIds) {
    try {
      const resp = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${botToken}`
        },
        body: JSON.stringify({
          channel: slackId,       // Using user's Slack ID opens a DM
          blocks: finalBlocks,
          text: 'LAMS Leave Notification'  // Fallback for notifications
        })
      });
      const data = await resp.json();
      results.push({ slackId, ok: data.ok, error: data.error || null });
    } catch (err) {
      results.push({ slackId, ok: false, error: err.message });
    }
  }

  return res.status(200).json({ ok: true, results });
}
