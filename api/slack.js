const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SLACK_WEBHOOK_URL) {
    console.warn('SLACK_WEBHOOK_URL not set in Vercel environment variables');
    return res.status(200).json({ warning: 'Slack not configured, skipping' });
  }

  try {
    const payload = req.body;

    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Slack API error:', response.status, text);
      return res.status(502).json({ error: 'Slack API error' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
