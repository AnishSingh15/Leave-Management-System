import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    query,
    where,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { ReimbursementRequest, ReimbursementItem, User } from '../types';

// Convert Firestore document to ReimbursementRequest
const convertReimbursementDoc = (docSnap: any): ReimbursementRequest => {
    const data = docSnap.data();
    return {
        id: docSnap.id,
        employeeId: data.employeeId,
        employeeName: data.employeeName,
        employeeEmail: data.employeeEmail,
        items: data.items || [],
        totalAmount: data.totalAmount || 0,
        managerId: data.managerId,
        managerName: data.managerName,
        status: data.status,
        managerComment: data.managerComment || '',
        hrComment: data.hrComment || '',
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
    };
};

// Convert image file to base64 data URL (free alternative to Firebase Storage)
export const convertImageToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

// Submit a reimbursement request
export const submitReimbursement = async (
    user: User,
    items: ReimbursementItem[],
    managerId: string,
    managerName: string
): Promise<void> => {
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

    if (items.length === 0) {
        throw new Error('Please add at least one reimbursement item.');
    }

    await addDoc(collection(db, 'reimbursements'), {
        employeeId: user.uid,
        employeeName: user.name,
        employeeEmail: user.email,
        items,
        totalAmount,
        managerId,
        managerName,
        status: 'pending',
        managerComment: '',
        hrComment: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
};

// Get employee's own reimbursement requests
export const getEmployeeReimbursements = async (userId: string): Promise<ReimbursementRequest[]> => {
    const q = query(
        collection(db, 'reimbursements'),
        where('employeeId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(convertReimbursementDoc)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// Get pending reimbursement requests for a manager
export const getPendingReimbursements = async (managerId: string): Promise<ReimbursementRequest[]> => {
    const q = query(
        collection(db, 'reimbursements'),
        where('managerId', '==', managerId),
        where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(convertReimbursementDoc)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// Get all pending reimbursement requests (for HR — shows manager-approved requests)
export const getAllPendingReimbursements = async (): Promise<ReimbursementRequest[]> => {
    const q = query(
        collection(db, 'reimbursements'),
        where('status', '==', 'pending_hr')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(convertReimbursementDoc)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// Get all reimbursement requests (for HR admin panel)
export const getAllReimbursements = async (): Promise<ReimbursementRequest[]> => {
    const snapshot = await getDocs(collection(db, 'reimbursements'));
    return snapshot.docs
        .map(convertReimbursementDoc)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// Manager approves reimbursement → moves to pending_hr
export const approveReimbursement = async (
    requestId: string,
    comment: string
): Promise<void> => {
    const reqRef = doc(db, 'reimbursements', requestId);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) throw new Error('Request not found');
    const request = convertReimbursementDoc(reqSnap);
    if (request.status !== 'pending') throw new Error('Request is no longer pending');

    await updateDoc(reqRef, {
        status: 'pending_hr',
        managerComment: comment,
        updatedAt: serverTimestamp(),
    });
};

// Manager rejects reimbursement
export const rejectReimbursement = async (
    requestId: string,
    comment: string
): Promise<void> => {
    const reqRef = doc(db, 'reimbursements', requestId);
    await updateDoc(reqRef, {
        status: 'rejected',
        managerComment: comment,
        updatedAt: serverTimestamp(),
    });
};

// HR approves reimbursement → final approval
export const hrApproveReimbursement = async (
    requestId: string,
    comment: string
): Promise<void> => {
    const reqRef = doc(db, 'reimbursements', requestId);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) throw new Error('Request not found');
    const request = convertReimbursementDoc(reqSnap);
    if (request.status !== 'pending_hr') throw new Error('Request is not pending HR approval');

    await updateDoc(reqRef, {
        status: 'approved',
        hrComment: comment,
        updatedAt: serverTimestamp(),
    });
};

// HR rejects reimbursement
export const hrRejectReimbursement = async (
    requestId: string,
    comment: string
): Promise<void> => {
    const reqRef = doc(db, 'reimbursements', requestId);
    await updateDoc(reqRef, {
        status: 'rejected',
        hrComment: comment,
        updatedAt: serverTimestamp(),
    });
};
