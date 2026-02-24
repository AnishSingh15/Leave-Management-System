import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    submitReimbursement,
    convertImageToBase64,
    getEmployeeReimbursements,
} from '../../services/reimbursementService';
import { getManagers } from '../../services/userService';
import { ReimbursementItem, ReimbursementRequest, User } from '../../types';
import { format } from 'date-fns';
import './Reimbursement.css';

interface FormItem {
    name: string;
    amount: string;
    files: File[];
    previews: string[];
}

const Reimbursement: React.FC = () => {
    const { userData } = useAuth();
    const [managers, setManagers] = useState<User[]>([]);
    const [managerId, setManagerId] = useState('');
    const [items, setItems] = useState<FormItem[]>([{ name: '', amount: '', files: [], previews: [] }]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [myRequests, setMyRequests] = useState<ReimbursementRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewImage, setViewImage] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!userData?.uid) return;
            setLoading(true);
            try {
                const managerList = await getManagers();
                setManagers(managerList.filter(m => m.uid !== userData.uid));
            } catch (err) {
                console.error('Error fetching managers:', err);
            }
            try {
                const requests = await getEmployeeReimbursements(userData.uid);
                setMyRequests(requests);
            } catch (err) {
                console.error('Error fetching reimbursements:', err);
            }
            setLoading(false);
        };
        fetchData();
    }, [userData?.uid]);

    const addItem = () => {
        setItems([...items, { name: '', amount: '', files: [], previews: [] }]);
    };

    const removeItem = (index: number) => {
        if (items.length <= 1) return;
        const updated = [...items];
        // Revoke object URLs
        updated[index].previews.forEach(url => URL.revokeObjectURL(url));
        updated.splice(index, 1);
        setItems(updated);
    };

    const updateItem = (index: number, field: 'name' | 'amount', value: string) => {
        const updated = [...items];
        updated[index][field] = value;
        setItems(updated);
    };

    const handleFileChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList) return;

        const updated = [...items];
        const existingFiles = updated[index].files;
        const existingPreviews = updated[index].previews;

        // Append new files, cap at 10 total
        const newFiles = Array.from(fileList);
        const combined = [...existingFiles, ...newFiles].slice(0, 10);
        const combinedPreviews = [
            ...existingPreviews,
            ...newFiles.map(f => URL.createObjectURL(f))
        ].slice(0, 10);

        updated[index].files = combined;
        updated[index].previews = combinedPreviews;
        setItems(updated);

        // Reset input so same file can be re-selected
        e.target.value = '';
    };

    const removeFile = (itemIndex: number, fileIndex: number) => {
        const updated = [...items];
        URL.revokeObjectURL(updated[itemIndex].previews[fileIndex]);
        updated[itemIndex].files.splice(fileIndex, 1);
        updated[itemIndex].previews.splice(fileIndex, 1);
        setItems(updated);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userData) return;

        setError('');
        setSuccess('');

        // Validate
        if (!managerId) {
            setError('Please select a manager.');
            return;
        }

        for (let i = 0; i < items.length; i++) {
            if (!items[i].name.trim()) {
                setError(`Item ${i + 1}: Please enter a name.`);
                return;
            }
            if (!items[i].amount || parseFloat(items[i].amount) <= 0) {
                setError(`Item ${i + 1}: Please enter a valid amount.`);
                return;
            }
            if (items[i].files.length === 0) {
                setError(`Item ${i + 1}: Please attach at least one bill image.`);
                return;
            }
        }

        const selectedManager = managers.find(m => m.uid === managerId);
        if (!selectedManager) {
            setError('Please select a valid manager.');
            return;
        }

        setSubmitting(true);
        try {
            // Convert all bill images to base64
            const reimbursementItems: ReimbursementItem[] = [];

            for (const item of items) {
                const billUrls: string[] = [];
                for (const file of item.files) {
                    const base64 = await convertImageToBase64(file);
                    billUrls.push(base64);
                }
                reimbursementItems.push({
                    name: item.name.trim(),
                    amount: parseFloat(item.amount),
                    billUrls,
                });
            }

            await submitReimbursement(userData, reimbursementItems, managerId, selectedManager.name);
            setSuccess('Reimbursement request submitted successfully! ✅');
            setItems([{ name: '', amount: '', files: [], previews: [] }]);
            setManagerId('');

            // Refresh
            const requests = await getEmployeeReimbursements(userData.uid);
            setMyRequests(requests);
        } catch (err: any) {
            setError(err.message || 'Failed to submit reimbursement');
        } finally {
            setSubmitting(false);
        }
    };

    const totalAmount = items.reduce((sum, item) => {
        const amt = parseFloat(item.amount);
        return sum + (isNaN(amt) ? 0 : amt);
    }, 0);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved': return 'approved';
            case 'rejected': return 'rejected';
            case 'pending_hr': return 'pending_hr';
            default: return 'pending';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'approved': return 'Approved';
            case 'rejected': return 'Rejected';
            case 'pending_hr': return 'Pending HR';
            case 'pending': return 'Pending Manager';
            default: return status;
        }
    };

    return (
        <div className="reimbursement-page">
            <div className="page-header">
                <h1>Reimbursement</h1>
                <p>Submit expense reimbursement requests</p>
            </div>

            {/* Reimbursement Form */}
            <div className="card reimbursement-form-card">
                <div className="card-header">
                    <h2>💰 New Reimbursement Request</h2>
                </div>

                {error && <div className="reimb-error">{error}</div>}
                {success && <div className="reimb-success">{success}</div>}

                <form className="reimb-form" onSubmit={handleSubmit}>
                    {/* Manager selection */}
                    <div className="form-group reimb-manager-group">
                        <label htmlFor="reimb-manager">Approving Manager *</label>
                        <select
                            id="reimb-manager"
                            value={managerId}
                            onChange={(e) => setManagerId(e.target.value)}
                            required
                        >
                            <option value="">Select Manager</option>
                            {managers.map(m => (
                                <option key={m.uid} value={m.uid}>
                                    {m.name} ({m.role.replace('_', ' ')})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Reimbursement Items */}
                    <div className="reimb-items">
                        {items.map((item, idx) => (
                            <div key={idx} className="reimb-item-card">
                                <div className="reimb-item-header">
                                    <span className="reimb-item-number">Item {idx + 1}</span>
                                    {items.length > 1 && (
                                        <button
                                            type="button"
                                            className="reimb-remove-btn"
                                            onClick={() => removeItem(idx)}
                                        >
                                            ✕ Remove
                                        </button>
                                    )}
                                </div>

                                <div className="reimb-item-fields">
                                    <div className="form-group">
                                        <label>Expense Name *</label>
                                        <input
                                            type="text"
                                            value={item.name}
                                            onChange={(e) => updateItem(idx, 'name', e.target.value)}
                                            placeholder="e.g. Cab fare, Hotel stay, Meals"
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Amount (₹) *</label>
                                        <input
                                            type="number"
                                            value={item.amount}
                                            onChange={(e) => updateItem(idx, 'amount', e.target.value)}
                                            placeholder="0.00"
                                            min="1"
                                            step="0.01"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Bill / Receipt (up to 10 images) *</label>
                                    <div className="file-upload-area">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={(e) => handleFileChange(idx, e)}
                                            id={`file-${idx}`}
                                            className="file-input-hidden"
                                        />
                                        <label htmlFor={`file-${idx}`} className="file-upload-label">
                                            📎 {item.files.length >= 10
                                                ? '10/10 files attached'
                                                : item.files.length > 0
                                                    ? `${item.files.length}/10 — click to add more`
                                                    : 'Click to attach bill images'}
                                        </label>
                                    </div>

                                    {item.previews.length > 0 && (
                                        <div className="bill-previews">
                                            {item.previews.map((preview, fIdx) => (
                                                <div key={fIdx} className="bill-preview-item">
                                                    <img src={preview} alt={`Bill ${fIdx + 1}`} />
                                                    <button
                                                        type="button"
                                                        className="preview-remove"
                                                        onClick={() => removeFile(idx, fIdx)}
                                                    >
                                                        ✕
                                                    </button>
                                                    <span className="preview-name">{item.files[fIdx]?.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <button type="button" className="reimb-add-btn" onClick={addItem}>
                        + Add Another Item
                    </button>

                    {/* Total */}
                    {totalAmount > 0 && (
                        <div className="reimb-total">
                            <span>Total Amount:</span>
                            <span className="reimb-total-value">₹{totalAmount.toFixed(2)}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary reimb-submit-btn"
                        disabled={submitting}
                    >
                        {submitting ? 'Processing...' : 'Submit Reimbursement'}
                    </button>
                </form>
            </div>

            {/* My Reimbursement Requests */}
            <div className="card reimb-history-card">
                <div className="card-header">
                    <h2>My Reimbursement Requests</h2>
                </div>

                {loading ? (
                    <div className="loading">Loading...</div>
                ) : myRequests.length === 0 ? (
                    <div className="empty-state">
                        <h3>No reimbursement requests yet</h3>
                        <p>Submit your first reimbursement above</p>
                    </div>
                ) : (
                    <div className="reimb-requests-list">
                        {myRequests.map((req) => (
                            <div key={req.id} className="reimb-request-card">
                                <div className="reimb-request-header">
                                    <div>
                                        <span className="reimb-request-date">
                                            {format(new Date(req.createdAt), 'MMM dd, yyyy')}
                                        </span>
                                        <span className="reimb-request-manager">→ {req.managerName}</span>
                                    </div>
                                    <div className="reimb-request-right">
                                        <span className="reimb-request-amount">₹{req.totalAmount.toFixed(2)}</span>
                                        <span className={`status-badge ${getStatusBadge(req.status)}`}>
                                            {getStatusLabel(req.status)}
                                        </span>
                                    </div>
                                </div>

                                <div className="reimb-request-items">
                                    {req.items.map((item, idx) => (
                                        <div key={idx} className="reimb-request-item">
                                            <span className="reimb-item-name">{item.name}</span>
                                            <span className="reimb-item-amt">₹{item.amount.toFixed(2)}</span>
                                            <div className="reimb-item-bills">
                                                {item.billUrls.map((url, bIdx) => (
                                                    <button
                                                        key={bIdx}
                                                        type="button"
                                                        className="bill-thumb-btn"
                                                        onClick={() => setViewImage(url)}
                                                        title="Click to view full size"
                                                    >
                                                        <img
                                                            src={url}
                                                            alt={`Bill ${bIdx + 1}`}
                                                        />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {req.managerComment && (
                                    <div className="reimb-request-comment">
                                        <strong>Manager Comment:</strong> {req.managerComment}
                                    </div>
                                )}
                                {req.hrComment && (
                                    <div className="reimb-request-comment">
                                        <strong>HR Comment:</strong> {req.hrComment}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Image Viewer Modal */}
            {viewImage && (
                <div className="image-modal-overlay" onClick={() => setViewImage(null)}>
                    <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="image-modal-close" onClick={() => setViewImage(null)}>✕</button>
                        <img src={viewImage} alt="Bill" />
                        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                            <a
                                href={viewImage}
                                download="receipt.png"
                                className="btn btn-primary"
                                style={{ textDecoration: 'none', display: 'inline-block' }}
                            >
                                ⬇ Download Receipt
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Reimbursement;
