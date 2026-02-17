import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { AttendanceRecord, MissedClockInRequest, User } from '../types';

// Helper: get today's date as YYYY-MM-DD in IST
const getTodayIST = (): string => {
    const now = new Date();
    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + (istOffset + now.getTimezoneOffset() * 60 * 1000));
    return istDate.toISOString().split('T')[0];
};

// Helper: get 7 PM IST for a given date string (YYYY-MM-DD)
const get7PMISTForDate = (dateStr: string): Date => {
    // 7 PM IST = 13:30 UTC
    return new Date(`${dateStr}T13:30:00.000Z`);
};

// Helper: check if current time is past 7 PM IST
const isPast7PMIST = (): boolean => {
    const now = new Date();
    const todayStr = getTodayIST();
    const sevenPM = get7PMISTForDate(todayStr);
    return now >= sevenPM;
};

// Helper: build doc ID
const buildDocId = (userId: string, date: string): string => `${userId}_${date}`;

// Convert Firestore document to AttendanceRecord
const convertAttendanceDoc = (docSnap: any): AttendanceRecord => {
    const data = docSnap.data();
    return {
        id: docSnap.id,
        employeeId: data.employeeId,
        employeeName: data.employeeName,
        date: data.date,
        clockInTime: data.clockInTime?.toDate?.() || new Date(data.clockInTime),
        clockOutTime: data.clockOutTime?.toDate?.() || new Date(data.clockOutTime),
        status: data.status,
        isMissedClockIn: data.isMissedClockIn || false,
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
    };
};

// Convert Firestore document to MissedClockInRequest
const convertMissedClockInDoc = (docSnap: any): MissedClockInRequest => {
    const data = docSnap.data();
    return {
        id: docSnap.id,
        employeeId: data.employeeId,
        employeeName: data.employeeName,
        date: data.date,
        reason: data.reason,
        managerId: data.managerId,
        managerName: data.managerName,
        status: data.status,
        managerComment: data.managerComment || '',
        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
    };
};

// Clock in for today
export const clockIn = async (user: User): Promise<AttendanceRecord> => {
    const today = getTodayIST();
    const docId = buildDocId(user.uid, today);
    const docRef = doc(db, 'attendance', docId);

    // Check if already clocked in
    const existing = await getDoc(docRef);
    if (existing.exists()) {
        throw new Error('You have already clocked in today!');
    }

    // Check if it's past 7 PM IST
    if (isPast7PMIST()) {
        throw new Error('Clock-in is not available after 7:00 PM IST.');
    }

    const now = new Date();
    const clockOutTime = get7PMISTForDate(today);

    const record = {
        employeeId: user.uid,
        employeeName: user.name,
        date: today,
        clockInTime: Timestamp.fromDate(now),
        clockOutTime: Timestamp.fromDate(clockOutTime),
        status: 'clocked_in' as const,
        isMissedClockIn: false,
        createdAt: serverTimestamp(),
    };

    await setDoc(docRef, record);

    return {
        id: docId,
        employeeId: user.uid,
        employeeName: user.name,
        date: today,
        clockInTime: now,
        clockOutTime: clockOutTime,
        status: 'clocked_in',
        isMissedClockIn: false,
        createdAt: now,
    };
};

// Get today's attendance for a user
export const getTodayAttendance = async (userId: string): Promise<AttendanceRecord | null> => {
    const today = getTodayIST();
    const docId = buildDocId(userId, today);
    const docRef = doc(db, 'attendance', docId);

    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;

    const record = convertAttendanceDoc(docSnap);

    // If it's past 7 PM, update the status on the client side
    if (isPast7PMIST() && record.status === 'clocked_in') {
        record.status = 'auto_logged_out';
    }

    return record;
};

// Get all attendance records for a specific date (HR/Manager report)
export const getAttendanceByDate = async (date: string): Promise<AttendanceRecord[]> => {
    const q = query(
        collection(db, 'attendance'),
        where('date', '==', date),
        orderBy('clockInTime', 'asc')
    );

    const snapshot = await getDocs(q);
    const records = snapshot.docs.map(convertAttendanceDoc);

    // Mark as auto_logged_out if past 7 PM for the selected date
    const sevenPM = get7PMISTForDate(date);
    const now = new Date();

    return records.map(r => ({
        ...r,
        status: now >= sevenPM && r.status === 'clocked_in' ? 'auto_logged_out' as const : r.status,
    }));
};

// Get user's attendance history for a month
export const getUserAttendanceHistory = async (
    userId: string,
    year: number,
    month: number
): Promise<AttendanceRecord[]> => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDay = new Date(year, month, 0).getDate(); // last day of month
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    const q = query(
        collection(db, 'attendance'),
        where('employeeId', '==', userId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
    );

    const snapshot = await getDocs(q);
    const now = new Date();

    return snapshot.docs.map(d => {
        const record = convertAttendanceDoc(d);
        const sevenPM = get7PMISTForDate(record.date);
        if (now >= sevenPM && record.status === 'clocked_in') {
            record.status = 'auto_logged_out';
        }
        return record;
    });
};

// ============================
// Missed Clock-In Functions
// ============================

// Submit a missed clock-in request
export const submitMissedClockIn = async (
    user: User,
    date: string,
    managerId: string,
    managerName: string
): Promise<void> => {
    const today = getTodayIST();

    // Validate: date must be in the past
    if (date >= today) {
        throw new Error('Missed clock-in can only be applied for past dates.');
    }

    // Check if attendance already exists for that date
    const docId = buildDocId(user.uid, date);
    const existingAttendance = await getDoc(doc(db, 'attendance', docId));
    if (existingAttendance.exists()) {
        throw new Error('You already have an attendance record for this date.');
    }

    // Check if a pending request already exists for this date
    const q = query(
        collection(db, 'missedClockIns'),
        where('employeeId', '==', user.uid),
        where('date', '==', date),
        where('status', '==', 'pending')
    );
    const existing = await getDocs(q);
    if (!existing.empty) {
        throw new Error('You already have a pending missed clock-in request for this date.');
    }

    await addDoc(collection(db, 'missedClockIns'), {
        employeeId: user.uid,
        employeeName: user.name,
        date,
        managerId,
        managerName,
        status: 'pending',
        managerComment: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
};

// Get pending missed clock-in requests for a manager
export const getPendingMissedClockIns = async (managerId: string): Promise<MissedClockInRequest[]> => {
    const q = query(
        collection(db, 'missedClockIns'),
        where('managerId', '==', managerId),
        where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(convertMissedClockInDoc)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// Get all pending missed clock-in requests (for HR)
export const getAllPendingMissedClockIns = async (): Promise<MissedClockInRequest[]> => {
    const q = query(
        collection(db, 'missedClockIns'),
        where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(convertMissedClockInDoc)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// Get employee's own missed clock-in requests
export const getEmployeeMissedClockIns = async (userId: string): Promise<MissedClockInRequest[]> => {
    const q = query(
        collection(db, 'missedClockIns'),
        where('employeeId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(convertMissedClockInDoc)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

// Approve missed clock-in → create attendance record
export const approveMissedClockIn = async (
    requestId: string,
    comment: string
): Promise<void> => {
    const reqRef = doc(db, 'missedClockIns', requestId);
    const reqSnap = await getDoc(reqRef);

    if (!reqSnap.exists()) throw new Error('Request not found');
    const request = convertMissedClockInDoc(reqSnap);

    if (request.status !== 'pending') throw new Error('Request is no longer pending');

    // Create attendance record for the missed date
    const docId = buildDocId(request.employeeId, request.date);
    const clockOutTime = get7PMISTForDate(request.date);
    // Use 11 AM IST as default clock-in time for missed entries
    const clockInTime = new Date(`${request.date}T05:30:00.000Z`); // 11 AM IST = 5:30 UTC

    await setDoc(doc(db, 'attendance', docId), {
        employeeId: request.employeeId,
        employeeName: request.employeeName,
        date: request.date,
        clockInTime: Timestamp.fromDate(clockInTime),
        clockOutTime: Timestamp.fromDate(clockOutTime),
        status: 'auto_logged_out',
        isMissedClockIn: true,
        createdAt: serverTimestamp(),
    });

    // Update request status
    await updateDoc(reqRef, {
        status: 'approved',
        managerComment: comment,
        updatedAt: serverTimestamp(),
    });
};

// Reject missed clock-in
export const rejectMissedClockIn = async (
    requestId: string,
    comment: string
): Promise<void> => {
    const reqRef = doc(db, 'missedClockIns', requestId);
    await updateDoc(reqRef, {
        status: 'rejected',
        managerComment: comment,
        updatedAt: serverTimestamp(),
    });
};
