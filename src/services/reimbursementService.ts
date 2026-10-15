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

// Compress and convert image file to optimized base64 JPEG with adaptive budget
export const compressAndConvertToBase64 = async (
    file: File,
    targetMaxChars: number = 70000
): Promise<string> => {
    return new Promise((resolve, reject) => {
        // If file is not an image (e.g. PDF)
        if (!file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                if (result.length > targetMaxChars) {
                    reject(new Error(`File "${file.name}" is not an image and exceeds size limit. Please upload JPG or PNG receipts.`));
                } else {
                    resolve(result);
                }
            };
            reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
            reader.readAsDataURL(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            const img = new Image();
            img.onload = () => {
                const attemptCompression = (wMax: number, hMax: number, q: number): string => {
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > wMax) {
                            height = Math.round((height * wMax) / width);
                            width = wMax;
                        }
                    } else {
                        if (height > hMax) {
                            width = Math.round((width * hMax) / height);
                            height = hMax;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, width);
                    canvas.height = Math.max(1, height);
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return dataUrl;

                    // Fill white background in case image has transparency (PNG to JPEG)
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    return canvas.toDataURL('image/jpeg', q);
                };

                // Progressive steps from standard down to compact
                const steps = [
                    { w: 700, h: 700, q: 0.6 },
                    { w: 600, h: 600, q: 0.5 },
                    { w: 500, h: 500, q: 0.4 },
                    { w: 400, h: 400, q: 0.35 },
                ];

                let compressed = attemptCompression(steps[0].w, steps[0].h, steps[0].q);

                for (let i = 1; i < steps.length && compressed.length > targetMaxChars; i++) {
                    compressed = attemptCompression(steps[i].w, steps[i].h, steps[i].q);
                }

                resolve(compressed);
            };
            img.onerror = () => {
                if (dataUrl.length > targetMaxChars) {
                    reject(new Error(`Image "${file.name}" format is unsupported and too large. Please upload as standard JPG or PNG.`));
                } else {
                    resolve(dataUrl);
                }
            };
            img.src = dataUrl;
        };
        reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
        reader.readAsDataURL(file);
    });
};

// Convert image file to base64 data URL
export const convertImageToBase64 = compressAndConvertToBase64;

// Download a bill image (robust for base64 data URLs, blob URLs, and external URLs)
export const downloadBillImage = (url: string, filename: string = 'bill_receipt.jpg') => {
    if (!url) return;
    try {
        if (url.startsWith('data:')) {
            // Convert data URL to Blob for reliable browser download without Chrome blocking
            const parts = url.split(',');
            const mimeMatch = parts[0].match(/:(.*?);/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            const ext = mimeType.includes('png') ? '.png' : mimeType.includes('pdf') ? '.pdf' : '.jpg';
            const cleanFilename = filename.endsWith('.jpg') || filename.endsWith('.png') || filename.endsWith('.pdf')
                ? filename
                : `${filename}${ext}`;

            const byteCharacters = atob(parts[1]);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });
            const blobUrl = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = cleanFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
            return;
        }

        // For HTTP / HTTPS URLs (e.g. Firebase storage URLs)
        fetch(url)
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                return res.blob();
            })
            .then((blob) => {
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
            })
            .catch(() => {
                window.open(url, '_blank');
            });
    } catch (err) {
        console.error('Error downloading bill image:', err);
        const win = window.open();
        if (win) {
            win.document.write(`<img src="${url}" style="max-width:100%" alt="Receipt"/>`);
        }
    }
};

// Download all bills for a reimbursement request
export const downloadAllBills = (req: ReimbursementRequest) => {
    let count = 0;
    (req.items || []).forEach((item, itemIdx) => {
        (item.billUrls || []).forEach((url, billIdx) => {
            const safeEmp = (req.employeeName || 'employee').replace(/[^a-zA-Z0-9_-]/g, '_');
            const safeItem = (item.name || `item${itemIdx + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
            const filename = `${safeEmp}_${safeItem}_bill${billIdx + 1}.jpg`;
            setTimeout(() => {
                downloadBillImage(url, filename);
            }, count * 350);
            count++;
        });
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

// Get manager reimbursement history
export const getManagerReimbursementHistory = async (managerId: string): Promise<ReimbursementRequest[]> => {
    const q = query(
        collection(db, 'reimbursements'),
        where('managerId', '==', managerId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(convertReimbursementDoc)
        .filter(req => req.status !== 'pending')
        .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
};

// Get HR reimbursement history
export const getHRReimbursementHistory = async (): Promise<ReimbursementRequest[]> => {
    const q = query(
        collection(db, 'reimbursements'),
        where('status', 'in', ['approved', 'rejected'])
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
        .map(convertReimbursementDoc)
        .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
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
