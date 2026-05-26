import { SlackNotification, LeaveStatus, LeaveType } from '../types';

// Endpoints
const SLACK_DM_ENDPOINT = '/api/slack-dm';     // DM via Bot Token (production)

// Format leave type for display
const formatLeaveType = (type: LeaveType): string => {
  const types: Record<LeaveType, string> = {
    earned: 'Earned Leave',
    casual: 'Casual Leave',
    paid: 'Paid Leave',
    comp_off: 'Comp Off',
    wfh: 'Work From Home',
    extra_work: 'Extra Day Work',
    menstrual: 'Menstrual Leave',
  };
  return types[type] || type;
};

// Format status for display
const formatStatus = (status: LeaveStatus): string => {
  const statuses: Record<LeaveStatus, string> = {
    pending_manager: '⏳ Pending Manager Approval',
    pending_hr: '⏳ Pending HR Approval',
    approved: '✅ Approved',
    rejected: '❌ Rejected',
    cancelled: '🚫 Cancelled'
  };
  return statuses[status] || status;
};

// Send Slack notification via Vercel serverless API
export const sendSlackNotification = async (notification: SlackNotification): Promise<void> => {
  // Build a clean readable message using Slack Block Kit
  const statusEmoji: Record<LeaveStatus, string> = {
    pending_manager: '🟡',
    pending_hr: '🟠',
    approved: '🟢',
    rejected: '🔴',
    cancelled: '⚪'
  };

  const emoji = statusEmoji[notification.status] || '📋';
  const title = `${emoji}  *Leave Request — ${formatStatus(notification.status)}*`;

  // Build @mention tags if mentionIds are provided
  let mentionLine = '';
  if (notification.mentionIds && notification.mentionIds.length > 0) {
    mentionLine = notification.mentionIds.map(id => `<@${id}>`).join(' ') + '\n\n';
  }

  // Main info lines
  let text = `${mentionLine}${title}\n\n`;
  text += `👤  *Employee:*  ${notification.employeeName}\n`;
  text += `📋  *Type:*  ${formatLeaveType(notification.leaveType)}\n`;
  text += `📅  *Dates:*  ${notification.startDate}  →  ${notification.endDate}\n`;
  text += `🔢  *Days:*  ${notification.totalDays}\n`;

  if (notification.managerName) {
    text += `👔  *Manager:*  ${notification.managerName}\n`;
  }

  // Comments section
  if (notification.managerComment || notification.hrComment) {
    text += `\n———————————————————\n`;
    if (notification.managerComment) {
      text += `💬  *Manager Comment:*  _${notification.managerComment}_\n`;
    }
    if (notification.hrComment) {
      text += `💬  *HR Comment:*  _${notification.hrComment}_\n`;
    }
  }

  // Deduction details
  if (notification.deductionDetails) {
    text += `\n———————————————————\n`;
    text += `📊  *Deduction:*  ${notification.deductionDetails}\n`;
  }

  const payload = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Leave Portal  •  ${new Date(notification.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
          }
        ]
      },
      { type: 'divider' }
    ]
  };

  try {
    const hasTargets = notification.targetSlackIds && notification.targetSlackIds.length > 0;

    if (hasTargets) {
      // Send personal DMs via Bot Token
      await fetch(SLACK_DM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: payload.blocks,
          targetSlackIds: notification.targetSlackIds,
          leaveId: notification.leaveId,
          approvalType: notification.approvalType
        })
      });
    }
    // If no target Slack IDs, notification is silently skipped (Slack IDs not set for the user)
  } catch (error) {
    console.error('Failed to send Slack notification:', error);
  }
};

// Build Slack message for leave submission
export const buildLeaveSubmissionMessage = (
  employeeName: string,
  leaveType: LeaveType,
  startDate: string,
  endDate: string,
  totalDays: number,
  reason: string
): string => {
  return `
🆕 *New Leave Request*

*Employee:* ${employeeName}
*Type:* ${formatLeaveType(leaveType)}
*Dates:* ${startDate} to ${endDate}
*Total Days:* ${totalDays}
*Reason:* ${reason}
*Status:* ${formatStatus('pending_manager')}
  `.trim();
};

// Build Slack message for manager decision
export const buildManagerDecisionMessage = (
  employeeName: string,
  leaveType: LeaveType,
  startDate: string,
  endDate: string,
  approved: boolean,
  managerName: string,
  comment: string
): string => {
  const emoji = approved ? '👍' : '👎';
  const decision = approved ? 'Approved by Manager' : 'Rejected by Manager';

  return `
${emoji} *Leave Request ${decision}*

*Employee:* ${employeeName}
*Type:* ${formatLeaveType(leaveType)}
*Dates:* ${startDate} to ${endDate}
*Manager:* ${managerName}
*Comment:* ${comment}
*Status:* ${formatStatus(approved ? 'pending_hr' : 'rejected')}
  `.trim();
};

// Build Slack message for HR decision
export const buildHRDecisionMessage = (
  employeeName: string,
  leaveType: LeaveType,
  startDate: string,
  endDate: string,
  approved: boolean,
  comment: string,
  deductionDetails?: string
): string => {
  const emoji = approved ? '✅' : '❌';
  const decision = approved ? 'Approved by HR' : 'Rejected by HR';

  let message = `
${emoji} *Leave Request ${decision}*

*Employee:* ${employeeName}
*Type:* ${formatLeaveType(leaveType)}
*Dates:* ${startDate} to ${endDate}
*HR Comment:* ${comment}
*Status:* ${formatStatus(approved ? 'approved' : 'rejected')}
  `.trim();

  if (approved && deductionDetails) {
    message += `\n*Deduction:* ${deductionDetails}`;
  }

  return message;
};
