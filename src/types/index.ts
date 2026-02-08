// User roles
export type UserRole = 'employee' | 'manager' | 'hr_admin';

// Leave types
export type LeaveType = 'casual' | 'paid' | 'sick' | 'comp_off' | 'wfh';

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
