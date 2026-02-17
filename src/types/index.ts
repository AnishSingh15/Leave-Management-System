// User roles
export type UserRole = 'employee' | 'manager' | 'hr_admin';

// Leave types
export type LeaveType = 'casual' | 'paid' | 'sick' | 'comp_off' | 'wfh' | 'extra_work';

// Leave status
export type LeaveStatus = 'pending_manager' | 'pending_hr' | 'approved' | 'rejected' | 'cancelled';

// User interface
export interface User {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  annualLeaveBalance: number;
  compOffBalance: number;
  slackMemberId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Leave source selection
export interface LeaveSourceSelection {
  compOff: boolean;
  annualLeave: boolean;
}

// Leave request interface
export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  isHalfDay: boolean;
  reason: string;
  selectedSources: LeaveSourceSelection;
  compOffUsed: number;
  annualLeaveUsed: number;
  managerId: string;
  managerName: string;
  status: LeaveStatus;
  managerComment: string;
  hrComment: string;
  hrOverride: boolean;
  hrOverrideDetails?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Audit log interface
export interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  performedByName: string;
  targetUserId?: string;
  targetUserName?: string;
  leaveRequestId?: string;
  details: string;
  previousValue?: any;
  newValue?: any;
  timestamp: Date;
}

// Slack notification payload
export interface SlackNotification {
  employeeName: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: LeaveStatus;
  managerName?: string;
  managerComment?: string;
  hrComment?: string;
  deductionDetails?: string;
  mentionIds?: string[];          // kept for @mention in fallback channel msgs
  targetSlackIds?: string[];      // DM recipients (Slack member IDs)
  leaveId?: string;               // for action buttons
  approvalType?: 'manager' | 'hr'; // which approval stage buttons should trigger
  timestamp: string;
}

// Leave form data
export interface LeaveFormData {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  isHalfDay: boolean;
  managerId: string;
  useCompOff: boolean;
  useAnnualLeave: boolean;
}

// Balance adjustment
export interface BalanceAdjustment {
  userId: string;
  type: 'annual_leave' | 'comp_off';
  amount: number;
  reason: string;
  adjustedBy: string;
  adjustedAt: Date;
}

// Attendance status
export type AttendanceStatus = 'clocked_in' | 'auto_logged_out';

// Attendance record — one doc per user per day
export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;                // "YYYY-MM-DD" format
  clockInTime: Date;           // actual time user clicked "Start Working"
  clockOutTime: Date;          // always 7:00 PM IST
  status: AttendanceStatus;
  isMissedClockIn?: boolean;   // true if created from approved missed clock-in
  createdAt: Date;
}

// Missed clock-in request status
export type MissedClockInStatus = 'pending' | 'approved' | 'rejected';

// Missed clock-in request
export interface MissedClockInRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;               // "YYYY-MM-DD" — the date they missed
  reason?: string;            // optional now
  managerId: string;
  managerName: string;
  status: MissedClockInStatus;
  managerComment: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================
// Reimbursement Types
// ============================

export type ReimbursementStatus = 'pending' | 'approved' | 'rejected';

// A single reimbursement item (name + bill images)
export interface ReimbursementItem {
  name: string;               // e.g. "Cab fare", "Hotel stay"
  amount: number;             // amount for this item
  billUrls: string[];         // URLs of uploaded bill images (1-2)
}

// Full reimbursement request
export interface ReimbursementRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  items: ReimbursementItem[];
  totalAmount: number;
  managerId: string;
  managerName: string;
  status: ReimbursementStatus;
  managerComment: string;
  createdAt: Date;
  updatedAt: Date;
}
