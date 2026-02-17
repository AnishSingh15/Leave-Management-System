import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  addDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { User, UserRole, AuditLog } from '../types';

// Convert Firestore document to User
const convertUserDoc = (doc: any): User => {
  const data = doc.data();
  return {
    ...data,
    uid: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date()
  } as User;
};

// Get all users
export const getAllUsers = async (): Promise<User[]> => {
  const q = query(collection(db, 'users'), orderBy('name'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(convertUserDoc);
};

// Get all active employees (for manager selection)
export const getActiveEmployees = async (): Promise<User[]> => {
  const q = query(
    collection(db, 'users'),
    where('isActive', '==', true),
    orderBy('name')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(convertUserDoc);
};

// Get all managers
export const getManagers = async (): Promise<User[]> => {
  const q = query(
    collection(db, 'users'),
    where('isActive', '==', true)
  );
  const snapshot = await getDocs(q);
  const allUsers = snapshot.docs.map(convertUserDoc);
  
  // Filter for managers and hr_admin, then sort by name
  return allUsers
    .filter(user => user.role === 'manager' || user.role === 'hr_admin')
    .sort((a, b) => a.name.localeCompare(b.name));
};

// Get user by ID
export const getUserById = async (userId: string): Promise<User | null> => {
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (!userDoc.exists()) {
    return null;
  }
  return convertUserDoc(userDoc);
};

// Update user role
export const updateUserRole = async (
  userId: string,
  newRole: UserRole,
  performedBy: string,
  performedByName: string
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (!userDoc.exists()) {
    throw new Error('User not found');
  }

  const userData = convertUserDoc(userDoc);
  const previousRole = userData.role;

  await updateDoc(userRef, {
    role: newRole,
    updatedAt: serverTimestamp()
  });

  // Create audit log
  await createAuditLog({
    action: 'ROLE_CHANGE',
    performedBy,
    performedByName,
    targetUserId: userId,
    targetUserName: userData.name,
    details: `Role changed from ${previousRole} to ${newRole}`,
    previousValue: previousRole,
    newValue: newRole
  });
};

// Adjust comp off balance
export const adjustCompOffBalance = async (
  userId: string,
  amount: number,
  reason: string,
  performedBy: string,
  performedByName: string
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (!userDoc.exists()) {
    throw new Error('User not found');
  }

  const userData = convertUserDoc(userDoc);
  const previousBalance = userData.compOffBalance;
  const newBalance = previousBalance + amount;

  if (newBalance < 0) {
    throw new Error('Cannot reduce comp off balance below 0');
  }

  await updateDoc(userRef, {
    compOffBalance: newBalance,
    updatedAt: serverTimestamp()
  });

  // Create audit log
  await createAuditLog({
    action: 'COMP_OFF_ADJUSTMENT',
    performedBy,
    performedByName,
    targetUserId: userId,
    targetUserName: userData.name,
    details: `Comp Off ${amount > 0 ? 'added' : 'deducted'}: ${Math.abs(amount)} days. Reason: ${reason}`,
    previousValue: previousBalance,
    newValue: newBalance
  });
};

// Adjust annual leave balance
export const adjustAnnualLeaveBalance = async (
  userId: string,
  amount: number,
  reason: string,
  performedBy: string,
  performedByName: string
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (!userDoc.exists()) {
    throw new Error('User not found');
  }

  const userData = convertUserDoc(userDoc);
  const previousBalance = userData.annualLeaveBalance;
  const newBalance = previousBalance + amount;

  if (newBalance < 0) {
    throw new Error('Cannot reduce annual leave balance below 0');
  }

  await updateDoc(userRef, {
    annualLeaveBalance: newBalance,
    updatedAt: serverTimestamp()
  });

  // Create audit log
  await createAuditLog({
    action: 'ANNUAL_LEAVE_ADJUSTMENT',
    performedBy,
    performedByName,
    targetUserId: userId,
    targetUserName: userData.name,
    details: `Annual Leave ${amount > 0 ? 'added' : 'deducted'}: ${Math.abs(amount)} days. Reason: ${reason}`,
    previousValue: previousBalance,
    newValue: newBalance
  });
};

// Toggle user active status
export const toggleUserStatus = async (
  userId: string,
  performedBy: string,
  performedByName: string
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (!userDoc.exists()) {
    throw new Error('User not found');
  }

  const userData = convertUserDoc(userDoc);
  const newStatus = !userData.isActive;

  await updateDoc(userRef, {
    isActive: newStatus,
    updatedAt: serverTimestamp()
  });

  // Create audit log
  await createAuditLog({
    action: 'USER_STATUS_CHANGE',
    performedBy,
    performedByName,
    targetUserId: userId,
    targetUserName: userData.name,
    details: `User ${newStatus ? 'activated' : 'deactivated'}`,
    previousValue: userData.isActive,
    newValue: newStatus
  });
};

// Create audit log
const createAuditLog = async (log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> => {
  await addDoc(collection(db, 'auditLogs'), {
    ...log,
    timestamp: serverTimestamp()
  });
};

// Update Slack Member ID
export const updateSlackMemberId = async (
  userId: string,
  slackMemberId: string,
  performedBy: string,
  performedByName: string
): Promise<void> => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error('User not found');

  const userName = userSnap.data().name || 'Unknown';

  await updateDoc(userRef, {
    slackMemberId,
    updatedAt: serverTimestamp()
  });

  await createAuditLog({
    action: 'slack_id_update',
    performedBy,
    performedByName,
    targetUserId: userId,
    targetUserName: userName,
    details: `Slack Member ID ${slackMemberId ? 'set to ' + slackMemberId : 'cleared'} for ${userName}`
  });
};

// Get audit logs
export const getAuditLogs = async (limit: number = 100): Promise<AuditLog[]> => {
  const q = query(
    collection(db, 'auditLogs'),
    orderBy('timestamp', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.slice(0, limit).map(doc => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      timestamp: data.timestamp?.toDate() || new Date()
    } as AuditLog;
  });
};
