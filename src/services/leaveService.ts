import {
  collection,
  doc,
  addDoc,
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

// Get manager leave history
export const getManagerLeaveHistory = async (managerId: string): Promise<LeaveRequest[]> => {
  const q = query(
    collection(db, 'leaves'),
    where('managerId', '==', managerId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(convertLeaveDoc)
    .filter(leave => leave.status !== 'pending_manager')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
};

// Get HR leave history
export const getHRLeaveHistory = async (): Promise<LeaveRequest[]> => {
  const q = query(
    collection(db, 'leaves'),
    where('status', 'in', ['approved', 'rejected', 'cancelled'])
  );
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(convertLeaveDoc)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
};

// Manager approval/rejection
export const managerDecision = async (
  leaveId: string,
  approved: boolean,
  comment: string,
  managerName: string
): Promise<void> => {
  let leaveData = null as LeaveRequest | null;
  let employeeId = '';

  await runTransaction(db, async (transaction) => {
    const leaveRef = doc(db, 'leaves', leaveId);
    const leaveDoc = await transaction.get(leaveRef);

    if (!leaveDoc.exists()) {
      throw new Error('Leave request not found');
    }

    leaveData = convertLeaveDoc(leaveDoc);
    employeeId = leaveData.employeeId;

    // Reject Flow
    if (!approved) {
      transaction.update(leaveRef, {
        status: 'rejected',
        managerComment: comment,
        updatedAt: serverTimestamp()
      });
      return;
    }

    // Approve Flow - Extra Work / Saturday Work
    if (leaveData.leaveType === 'extra_work') {
      const employeeRef = doc(db, 'users', employeeId);
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
        managerComment: comment,
        updatedAt: serverTimestamp()
      });
      return;
    }

    // Approve Flow - Normal Leaves
    transaction.update(leaveRef, {
      status: 'pending_hr',
      managerComment: comment,
      updatedAt: serverTimestamp()
    });
  });

  if (!leaveData) return;

  // Send Slack DMs after transaction succeeds
  const newStatus: LeaveStatus = approved
    ? (leaveData.leaveType === 'extra_work' ? 'approved' : 'pending_hr')
    : 'rejected';

  const empRef = doc(db, 'users', employeeId);
  const empSnap = await getDoc(empRef);
  const empSlackId = empSnap.exists() ? empSnap.data().slackMemberId : null;

  if (approved) {
    if (leaveData.leaveType === 'extra_work') {
      // Extra work is fully approved, just DM the employee
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
          deductionDetails: `Comp Off Earned: +${leaveData.totalDays} day(s)`,
          timestamp: new Date().toISOString(),
          targetSlackIds: [empSlackId]
        });
      }
    } else {
      // Normal leave -> DM HR admins with link to approve
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

      // Also DM the employee that their request was approved by manager & is now pending HR
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

export const hrApproval = async (
  leaveId: string,
  approved: boolean,
  comment: string,
  overrideCompOff?: number,
  overrideAnnualLeave?: number
): Promise<void> => {
  let leaveData = null as LeaveRequest | null;
  let employeeSlackId: string | null = null;
  let compOffUsed = 0;
  let annualLeaveUsed = 0;
  let hrOverrideDetails = '';

  await runTransaction(db, async (transaction) => {
    const leaveRef = doc(db, 'leaves', leaveId);
    const leaveDoc = await transaction.get(leaveRef);

    if (!leaveDoc.exists()) {
      throw new Error('Leave request not found');
    }

    leaveData = convertLeaveDoc(leaveDoc);

    const employeeRef = doc(db, 'users', leaveData.employeeId);
    const employeeDoc = await transaction.get(employeeRef);

    if (employeeDoc.exists()) {
      const empData = employeeDoc.data() as User;
      employeeSlackId = empData.slackMemberId || null;

      if (!approved) {
        transaction.update(leaveRef, {
          status: 'rejected',
          hrComment: comment,
          updatedAt: serverTimestamp()
        });
        return;
      }

      if (leaveData.leaveType === 'wfh') {
        transaction.update(leaveRef, {
          status: 'approved',
          hrComment: comment,
          updatedAt: serverTimestamp()
        });
        return;
      }

      if (leaveData.leaveType === 'extra_work') {
        transaction.update(employeeRef, {
          compOffBalance: empData.compOffBalance + leaveData.totalDays,
          updatedAt: serverTimestamp()
        });

        transaction.update(leaveRef, {
          status: 'approved',
          hrComment: comment,
          updatedAt: serverTimestamp()
        });
        return;
      }

      // Standard deductive leaves
      let remainingDays = leaveData.totalDays;
      let hrOverride = false;

      if (overrideCompOff !== undefined || overrideAnnualLeave !== undefined) {
        hrOverride = true;
        compOffUsed = overrideCompOff || 0;
        annualLeaveUsed = overrideAnnualLeave || 0;
        hrOverrideDetails = `HR Override: Comp Off = ${compOffUsed}, Annual Leave = ${annualLeaveUsed}`;
      } else {
        if (['menstrual', 'bereavement'].indexOf(leaveData.leaveType) === -1) {
          if (leaveData.selectedSources.compOff && empData.compOffBalance > 0) {
            compOffUsed = Math.min(empData.compOffBalance, remainingDays);
            remainingDays -= compOffUsed;
          }

          if (leaveData.selectedSources.annualLeave && remainingDays > 0) {
            annualLeaveUsed = Math.min(empData.annualLeaveBalance, remainingDays);
            remainingDays -= annualLeaveUsed;
          }
        }
      }

      transaction.update(employeeRef, {
        compOffBalance: empData.compOffBalance - compOffUsed,
        annualLeaveBalance: empData.annualLeaveBalance - annualLeaveUsed,
        updatedAt: serverTimestamp()
      });

      transaction.update(leaveRef, {
        status: 'approved',
        hrComment: comment,
        compOffUsed,
        annualLeaveUsed,
        hrOverride,
        hrOverrideDetails,
        updatedAt: serverTimestamp()
      });
    } else {
      // Employee doc doesn't exist, we can only update the leave
      transaction.update(leaveRef, {
        status: !approved ? 'rejected' : 'approved',
        hrComment: comment,
        updatedAt: serverTimestamp()
      });
    }
  });

  if (!leaveData) return;

  const targetIds = employeeSlackId ? [employeeSlackId] : [];

  if (targetIds.length > 0) {
    if (!approved) {
      await sendSlackNotification({
        employeeName: leaveData.employeeName,
        leaveType: leaveData.leaveType,
        startDate: leaveData.startDate.toISOString().split('T')[0],
        endDate: leaveData.endDate.toISOString().split('T')[0],
        totalDays: leaveData.totalDays,
        status: 'rejected',
        hrComment: comment,
        timestamp: new Date().toISOString(),
        targetSlackIds: targetIds
      });
    } else if (leaveData.leaveType === 'wfh') {
      await sendSlackNotification({
        employeeName: leaveData.employeeName,
        leaveType: leaveData.leaveType,
        startDate: leaveData.startDate.toISOString().split('T')[0],
        endDate: leaveData.endDate.toISOString().split('T')[0],
        totalDays: leaveData.totalDays,
        status: 'approved',
        hrComment: comment,
        timestamp: new Date().toISOString(),
        targetSlackIds: targetIds
      });
    } else if (leaveData.leaveType === 'extra_work') {
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
        targetSlackIds: targetIds
      });
    } else {
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
        targetSlackIds: targetIds
      });
    }
  }
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
