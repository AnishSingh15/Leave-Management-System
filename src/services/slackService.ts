import { SlackNotification, LeaveStatus, LeaveType } from '../types';

// Vercel serverless API endpoint for Slack (keeps webhook secret on server)
const SLACK_API_ENDPOINT = '/api/slack';

// Format leave type for display
const formatLeaveType = (type: LeaveType): string => {
  const types: Record<LeaveType, string> = {
    casual: 'Casual Leave',
    paid: 'Paid Leave',
    sick: 'Sick Leave',
    comp_off: 'Comp Off',
    wfh: 'Work From Home'
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

// Get status color for Slack attachment
const getStatusColor = (status: LeaveStatus): string => {
  const colors: Record<LeaveStatus, string> = {
    pending_manager: '#FFA500',
    pending_hr: '#FFA500',
    approved: '#36A64F',
    rejected: '#FF0000',
    cancelled: '#808080'
  };
  return colors[status] || '#808080';
};

// Send Slack notification via Vercel serverless API
export const sendSlackNotification = async (notification: SlackNotification): Promise<void> => {
  const fields = [
    {
      title: 'Employee',
      value: notification.employeeName,
      short: true
    },
    {
      title: 'Leave Type',
      value: formatLeaveType(notification.leaveType),
      short: true
    },
    {
      title: 'Dates',
      value: `${notification.startDate} to ${notification.endDate}`,
      short: true
    },
    {
      title: 'Total Days',
      value: notification.totalDays.toString(),
      short: true
    },
    {
      title: 'Status',
      value: formatStatus(notification.status),
      short: true
    }
  ];

  // Add manager info if available
  if (notification.managerName) {
    fields.push({
      title: 'Manager',
      value: notification.managerName,
      short: true
    });
  }

  // Add manager comment if available
  if (notification.managerComment) {
    fields.push({
      title: 'Manager Comment',
      value: notification.managerComment,
      short: false
    });
  }

  // Add HR comment if available
  if (notification.hrComment) {
    fields.push({
      title: 'HR Comment',
      value: notification.hrComment,
      short: false
    });
  }

  // Add deduction details if available
  if (notification.deductionDetails) {
    fields.push({
      title: 'Leave Deduction',
      value: notification.deductionDetails,
      short: false
    });
  }

  const payload = {
    attachments: [
      {
        color: getStatusColor(notification.status),
        title: 'Leave Request Update',
        fields,
        footer: 'Leave & Attendance Management System',
        ts: Math.floor(new Date(notification.timestamp).getTime() / 1000)
      }
    ]
  };

  try {
    // Send via Vercel serverless function (keeps Slack webhook URL secret on server)
    await fetch(SLACK_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
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
