import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { LeaveRequest, LeaveFormData, LeaveStatus, User } from '../types';
import { sendSlackNotification } from './slackService';

// Helper: get Slack Member IDs for all HR admins
const getHRSlackIds = async (): Promise<string[]> => {
  const q = query(
    collection(db, 'users'),
    where('role', '==', 'hr_admin')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(d => d.data().slackMemberId)
    .filter((id): id is string => !!id);
};

// Convert Firestore document to LeaveRequest
const convertLeaveDoc = (doc: any): LeaveRequest => {
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    startDate: data.startDate?.toDate() || new Date(),
    endDate: data.endDate?.toDate() || new Date(),
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date()
  } as LeaveRequest;
};

// Calculate total leave days between two dates
export const calculateLeaveDays = (startDate: string, endDate: string, isHalfDay: boolean): number => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let days = 0;
  
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Exclude weekends
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return isHalfDay ? 0.5 : days;
};

// Submit a new leave request
export const submitLeaveRequest = async (
  formData: LeaveFormData,
  employee: User,
  manager: User
): Promise<string> => {
  const totalDays = calculateLeaveDays(formData.startDate, formData.endDate, formData.isHalfDay);
  
  // Validate leave balance (skip for WFH, Saturday Work, Menstrual, and Bereavement)
  if (['wfh', 'extra_work', 'menstrual', 'bereavement'].indexOf(formData.leaveType) === -1) {
    const availableCompOff = formData.useCompOff ? employee.compOffBalance : 0;
    const availableAnnual = formData.useAnnualLeave ? employee.annualLeaveBalance : 0;
    
    if (availableCompOff + availableAnnual < totalDays) {
      throw new Error('Insufficient leave balance for the selected leave sources');
    }
  }

  // Menstrual leave validation: only 1 per month
  if (formData.leaveType === 'menstrual') {
    // Force endDate = startDate (1 day only)
    formData.endDate = formData.startDate;

    const startOfMonth = new Date(formData.startDate);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    
    // Query only by employeeId to avoid composite index requirement
    // Filter leaveType, startDate range, and status all in-memory
    const q = query(
      collection(db, 'leaves'),
      where('employeeId', '==', employee.uid)
    );

    const snapshot = await getDocs(q);
    const active = snapshot.docs.filter(d => {
      const data = d.data();
      const start = data.startDate?.toDate ? data.startDate.toDate() : new Date(data.startDate);
      return (
        data.leaveType === 'menstrual' &&
        ['approved', 'pending_manager', 'pending_hr'].includes(data.status) &&
        start >= startOfMonth &&
        start < endOfMonth
      );
    });
    if (active.length > 0) {
      throw new Error('You have already applied for Menstrual Leave this month.');
    }
  }

  const leaveRequest: Omit<LeaveRequest, 'id'> = {
    employeeId: employee.uid,
    employeeName: employee.name,
    employeeEmail: employee.email,
    leaveType: formData.leaveType,
    startDate: new Date(formData.startDate),
    endDate: new Date(formData.endDate),
    totalDays,
    isHalfDay: formData.isHalfDay,
    reason: formData.reason,
    selectedSources: {
      compOff: formData.useCompOff,
      annualLeave: formData.useAnnualLeave
    },
    compOffUsed: 0,
    annualLeaveUsed: 0,
    managerId: formData.managerId,
    managerName: manager.name,
    status: 'pending_manager',
    managerComment: '',
    hrComment: '',
    hrOverride: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const docRef = await addDoc(collection(db, 'leaves'), {
    ...leaveRequest,
    startDate: Timestamp.fromDate(leaveRequest.startDate),
    endDate: Timestamp.fromDate(leaveRequest.endDate),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // Send Slack DM to the manager with Approve/Reject buttons
  const managerTargetIds: string[] = manager.slackMemberId ? [manager.slackMemberId] : [];
  await sendSlackNotification({
    employeeName: employee.name,
    leaveType: formData.leaveType,
    startDate: formData.startDate,
    endDate: formData.endDate,
    totalDays,
    status: 'pending_manager',
    timestamp: new Date().toISOString(),
    targetSlackIds: managerTargetIds,
    leaveId: docRef.id,
    approvalType: 'manager'
  });

  return docRef.id;
};

// Get leave requests for an employee
export const getEmployeeLeaves = async (employeeId: string): Promise<LeaveRequest[]> => {
  const q = query(
    collection(db, 'leaves'),
    where('employeeId', '==', employeeId),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(convertLeaveDoc);
};

// Get leave requests pending manager approval
export const getManagerPendingLeaves = async (managerId: string): Promise<LeaveRequest[]> => {
  const q = query(
    collection(db, 'leaves'),
    where('managerId', '==', managerId),
    where('status', '==', 'pending_manager'),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(convertLeaveDoc);
};

// Get all leave requests pending HR approval
export const getHRPendingLeaves = async (): Promise<LeaveRequest[]> => {
  const q = query(
    collection(db, 'leaves'),
    where('status', '==', 'pending_hr'),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(convertLeaveDoc);
};

// Get all leave requests (for HR)
export const getAllLeaves = async (): Promise<LeaveRequest[]> => {
  const q = query(
    collection(db, 'leaves'),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(convertLeaveDoc);
};

// Manager approval/rejection
export const managerDecision = async (
  leaveId: string,
  approved: boolean,
  comment: string,
  managerName: string
): Promise<void> => {
  const leaveRef = doc(db, 'leaves', leaveId);
  const leaveDoc = await getDoc(leaveRef);
  
  if (!leaveDoc.exists()) {
    throw new Error('Leave request not found');
  }

  const leaveData = convertLeaveDoc(leaveDoc);
  const newStatus: LeaveStatus = approved ? 'pending_hr' : 'rejected';

  await updateDoc(leaveRef, {
    status: newStatus,
    managerComment: comment,
    updatedAt: serverTimestamp()
  });

  // Send Slack DMs
  const empRef = doc(db, 'users', leaveData.employeeId);
  const empSnap = await getDoc(empRef);
  const empSlackId = empSnap.exists() ? empSnap.data().slackMemberId : null;

  if (approved) {
    // 1. DM HR admins with link to approve
    const hrSlackIds = await getHRSlackIds();
    await sendSlackNotification({
      employeeName: leaveData.employeeName,
      leaveType: leaveData.leaveType,
      startDate: leaveData.startDate.toISOString().split('T')[0],
      endDate: leaveData.endDate.toISOString().split('T')[0],
      totalDays: leaveData.totalDays,
      status: newStatus,
      managerName,
      managerComment: comment,
      timestamp: new Date().toISOString(),
      targetSlackIds: hrSlackIds,
      leaveId,
      approvalType: 'hr'
    });

    // 2. Also DM the employee that their request was approved by manager & is now pending HR
    if (empSlackId) {
      await sendSlackNotification({
        employeeName: leaveData.employeeName,
        leaveType: leaveData.leaveType,
        startDate: leaveData.startDate.toISOString().split('T')[0],
        endDate: leaveData.endDate.toISOString().split('T')[0],
        totalDays: leaveData.totalDays,
        status: newStatus,
        managerName,
        managerComment: comment,
        timestamp: new Date().toISOString(),
        targetSlackIds: [empSlackId]
      });
    }
  } else {
    // Rejected → DM the employee
    if (empSlackId) {
      await sendSlackNotification({
        employeeName: leaveData.employeeName,
        leaveType: leaveData.leaveType,
        startDate: leaveData.startDate.toISOString().split('T')[0],
        endDate: leaveData.endDate.toISOString().split('T')[0],
        totalDays: leaveData.totalDays,
        status: newStatus,
        managerName,
        managerComment: comment,
        timestamp: new Date().toISOString(),
        targetSlackIds: [empSlackId]
      });
    }
  }
};

// HR approval with leave deduction
export const hrApproval = async (
  leaveId: string,
  approved: boolean,
  comment: string,
  overrideCompOff?: number,
  overrideAnnualLeave?: number
): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const leaveRef = doc(db, 'leaves', leaveId);
    const leaveDoc = await transaction.get(leaveRef);
    
    if (!leaveDoc.exists()) {
      throw new Error('Leave request not found');
    }

    const leaveData = convertLeaveDoc(leaveDoc);
    
    if (!approved) {
      transaction.update(leaveRef, {
        status: 'rejected',
        hrComment: comment,
        updatedAt: serverTimestamp()
      });

      // Notify the employee of rejection via DM
      const rejEmpRef = doc(db, 'users', leaveData.employeeId);
      const rejEmpSnap = await transaction.get(rejEmpRef);
      const rejTargetIds: string[] = rejEmpSnap.exists() && rejEmpSnap.data().slackMemberId
        ? [rejEmpSnap.data().slackMemberId] : [];

      await sendSlackNotification({
        employeeName: leaveData.employeeName,
        leaveType: leaveData.leaveType,
        startDate: leaveData.startDate.toISOString().split('T')[0],
        endDate: leaveData.endDate.toISOString().split('T')[0],
        totalDays: leaveData.totalDays,
        status: 'rejected',
        hrComment: comment,
        timestamp: new Date().toISOString(),
        targetSlackIds: rejTargetIds
      });
      return;
    }

    // Skip deduction for WFH
    if (leaveData.leaveType === 'wfh') {
      transaction.update(leaveRef, {
        status: 'approved',
        hrComment: comment,
        updatedAt: serverTimestamp()
      });

      // Notify the employee via DM
      const wfhEmpRef = doc(db, 'users', leaveData.employeeId);
      const wfhEmpSnap = await transaction.get(wfhEmpRef);
      const wfhTargetIds: string[] = wfhEmpSnap.exists() && wfhEmpSnap.data().slackMemberId
        ? [wfhEmpSnap.data().slackMemberId] : [];

      await sendSlackNotification({
        employeeName: leaveData.employeeName,
        leaveType: leaveData.leaveType,
        startDate: leaveData.startDate.toISOString().split('T')[0],
        endDate: leaveData.endDate.toISOString().split('T')[0],
        totalDays: leaveData.totalDays,
        status: 'approved',
        hrComment: comment,
        timestamp: new Date().toISOString(),
        targetSlackIds: wfhTargetIds
      });
      return;
    }

    // Saturday Work: credit comp-off balance instead of deducting
    if (leaveData.leaveType === 'extra_work') {
      const employeeRef = doc(db, 'users', leaveData.employeeId);
      const employeeDoc = await transaction.get(employeeRef);
      
      if (!employeeDoc.exists()) {
        throw new Error('Employee not found');
      }

      const employee = employeeDoc.data() as User;
      
      transaction.update(employeeRef, {
        compOffBalance: employee.compOffBalance + leaveData.totalDays,
        updatedAt: serverTimestamp()
      });

      transaction.update(leaveRef, {
        status: 'approved',
        hrComment: comment,
        updatedAt: serverTimestamp()
      });

      // Send Slack DM to the employee
      const satEmpData = employeeDoc.data() as User;
      const satTargetIds: string[] = satEmpData.slackMemberId ? [satEmpData.slackMemberId] : [];
      await sendSlackNotification({
        employeeName: leaveData.employeeName,
        leaveType: leaveData.leaveType,
        startDate: leaveData.startDate.toISOString().split('T')[0],
        endDate: leaveData.endDate.toISOString().split('T')[0],
        totalDays: leaveData.totalDays,
        status: 'approved',
        hrComment: comment,
        deductionDetails: `Comp Off Earned: +${leaveData.totalDays} day(s)`,
        timestamp: new Date().toISOString(),
        targetSlackIds: satTargetIds
      });
      return;
    }

    // Get employee data
    const employeeRef = doc(db, 'users', leaveData.employeeId);
    const employeeDoc = await transaction.get(employeeRef);
    
    if (!employeeDoc.exists()) {
      throw new Error('Employee not found');
    }

    const employee = employeeDoc.data() as User;
    let compOffUsed = 0;
    let annualLeaveUsed = 0;
    let remainingDays = leaveData.totalDays;
    let hrOverride = false;
    let hrOverrideDetails = '';

    // Check if HR is overriding the leave source
    if (overrideCompOff !== undefined || overrideAnnualLeave !== undefined) {
      hrOverride = true;
      compOffUsed = overrideCompOff || 0;
      annualLeaveUsed = overrideAnnualLeave || 0;
      hrOverrideDetails = `HR Override: Comp Off = ${compOffUsed}, Annual Leave = ${annualLeaveUsed}`;
    } else {
      // Standard deduction logic based on employee selection
      if (['menstrual', 'bereavement'].indexOf(leaveData.leaveType) === -1) {
        if (leaveData.selectedSources.compOff && employee.compOffBalance > 0) {
          compOffUsed = Math.min(employee.compOffBalance, remainingDays);
          remainingDays -= compOffUsed;
        }
        
        if (leaveData.selectedSources.annualLeave && remainingDays > 0) {
          annualLeaveUsed = Math.min(employee.annualLeaveBalance, remainingDays);
          remainingDays -= annualLeaveUsed;
        }
      }
    }

    // Update employee balances
    transaction.update(employeeRef, {
      compOffBalance: employee.compOffBalance - compOffUsed,
      annualLeaveBalance: employee.annualLeaveBalance - annualLeaveUsed,
      updatedAt: serverTimestamp()
    });

    // Update leave request
    transaction.update(leaveRef, {
      status: 'approved',
      hrComment: comment,
      compOffUsed,
      annualLeaveUsed,
      hrOverride,
      hrOverrideDetails,
      updatedAt: serverTimestamp()
    });

    // Send Slack DM to the employee
    const empTargetIds: string[] = employee.slackMemberId ? [employee.slackMemberId] : [];
    await sendSlackNotification({
      employeeName: leaveData.employeeName,
      leaveType: leaveData.leaveType,
      startDate: leaveData.startDate.toISOString().split('T')[0],
      endDate: leaveData.endDate.toISOString().split('T')[0],
      totalDays: leaveData.totalDays,
      status: 'approved',
      hrComment: comment,
      deductionDetails: `Comp Off Used: ${compOffUsed}, Annual Leave Used: ${annualLeaveUsed}${hrOverrideDetails ? ' | ' + hrOverrideDetails : ''}`,
      timestamp: new Date().toISOString(),
      targetSlackIds: empTargetIds
    });
  });
};

// HR cancel leave request
export const cancelLeaveRequest = async (leaveId: string, hrComment: string): Promise<void> => {
  await runTransaction(db, async (transaction) => {
    const leaveRef = doc(db, 'leaves', leaveId);
    const leaveDoc = await transaction.get(leaveRef);
    
    if (!leaveDoc.exists()) {
      throw new Error('Leave request not found');
    }

    const leaveData = convertLeaveDoc(leaveDoc);
    
    // If leave was approved, restore the balance
    if (leaveData.status === 'approved') {
      const employeeRef = doc(db, 'users', leaveData.employeeId);
      const employeeDoc = await transaction.get(employeeRef);
      
      if (employeeDoc.exists()) {
        const employee = employeeDoc.data() as User;
        transaction.update(employeeRef, {
          compOffBalance: employee.compOffBalance + leaveData.compOffUsed,
          annualLeaveBalance: employee.annualLeaveBalance + leaveData.annualLeaveUsed,
          updatedAt: serverTimestamp()
        });
      }
    }

    transaction.update(leaveRef, {
      status: 'cancelled',
      hrComment,
      updatedAt: serverTimestamp()
    });
  });
};

// Get a single leave request
export const getLeaveRequest = async (leaveId: string): Promise<LeaveRequest | null> => {
  const leaveDoc = await getDoc(doc(db, 'leaves', leaveId));
  if (!leaveDoc.exists()) {
    return null;
  }
  return convertLeaveDoc(leaveDoc);
};
