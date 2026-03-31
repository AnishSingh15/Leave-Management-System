// Temporary one-off script: Send Rules & Regulations PDF to all active users
// Uses Firebase client SDK (REST API) to fetch users, Zoho SMTP to send emails

const nodemailer = require('nodemailer');
const path = require('path');
const https = require('https');

const FIREBASE_PROJECT_ID = 'lams-622a7';

// Token from anonymous sign in
const FIREBASE_ID_TOKEN = process.env.FIREBASE_ID_TOKEN;

// Zoho credentials
const ZOHO_EMAIL = 'holiday@getmorph.com';
const ZOHO_PASSWORD = '1H3wHRx9U6N9';

// PDF path
const PDF_PATH = '/Users/anishsingh/Desktop/LMS/lams/Rules and Regulations- Morph.pdf';

// ─── Firestore REST API to fetch all active users ────────────────────────────
function firestoreQuery() {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: 'users' }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: 'isActive' },
                        op: 'EQUAL',
                        value: { booleanValue: true }
                    }
                }
            }
        });

        const options = {
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'Authorization': `Bearer ${FIREBASE_ID_TOKEN}`
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        return reject(new Error('API error: ' + data));
                    }
                    const results = JSON.parse(data);
                    const users = [];
                    for (const item of results) {
                        if (item.document && item.document.fields) {
                            const fields = item.document.fields;
                            const email = fields.email?.stringValue;
                            const name = fields.name?.stringValue || 'Team Member';
                            if (email) {
                                users.push({ name, email });
                            }
                        }
                    }
                    resolve(users);
                } catch (e) {
                    reject(new Error('Failed to parse Firestore response: ' + e.message));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── Email HTML ──────────────────────────────────────────────────────────────
function buildEmailHtml(name) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:36px 40px;text-align:center;">
<div style="font-size:48px;margin-bottom:8px;">📋</div>
<h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Rules & Regulations</h1>
</td></tr>
<tr><td style="padding:40px;">
<p style="font-size:16px;color:#334155;margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
<p style="font-size:16px;color:#334155;margin:0 0 24px;">Please find attached the company <strong>Rules & Regulations</strong> document. Kindly go through it at your earliest convenience.</p>
<div style="background:#f0f7ff;border-left:4px solid #2563eb;border-radius:8px;padding:20px 24px;margin:0 0 28px;">
<div style="font-size:15px;color:#475569;">The attached PDF contains our company policies, guidelines, and important rules that every team member should be aware of.</div>
</div>
<p style="font-size:14px;color:#94a3b8;margin:0;border-top:1px solid #e2e8f0;padding-top:20px;">
This is an automated email from <strong>LAMS – Leave & Attendance Management System</strong>.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('Fetching active users from Firestore...');
    const users = await firestoreQuery();

    console.log(`\nFound ${users.length} active users:`);
    users.forEach((u) => console.log(`  - ${u.name} <${u.email}>`));

    if (users.length === 0) {
        console.log('No users found. Exiting.');
        return;
    }

    // SMTP
    const transporter = nodemailer.createTransport({
        host: 'smtppro.zoho.com',
        port: 465,
        secure: true,
        auth: { user: ZOHO_EMAIL, pass: ZOHO_PASSWORD },
    });

    console.log(`\nPDF: ${PDF_PATH}`);
    console.log(`\nSending emails...\n`);

    let sent = 0;
    let failed = 0;
    for (const user of users) {
        try {
            await transporter.sendMail({
                from: `"LAMS - Leave Portal" <${ZOHO_EMAIL}>`,
                to: user.email,
                subject: 'Rules & Regulations – Morph',
                html: buildEmailHtml(user.name),
                attachments: [
                    {
                        filename: 'Rules and Regulations - Morph.pdf',
                        path: PDF_PATH,
                    },
                ],
            });
            console.log(`  ✅ Sent to ${user.email}`);
            sent++;
        } catch (err) {
            console.error(`  ❌ Failed for ${user.email}: ${err.message}`);
            failed++;
        }
    }

    console.log(`\nDone! Sent: ${sent}, Failed: ${failed}`);
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
