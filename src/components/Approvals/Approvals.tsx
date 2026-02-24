import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getManagerPendingLeaves,
  getHRPendingLeaves,
  managerDecision,
  hrApproval,
  getManagerLeaveHistory,
  getHRLeaveHistory
} from '../../services/leaveService';
import {
  getPendingMissedClockIns,
  getAllPendingMissedClockIns,
  approveMissedClockIn,
  rejectMissedClockIn,
  getManagerMissedClockInHistory,
  getHRMissedClockInHistory
} from '../../services/attendanceService';
import {
  getPendingReimbursements,
  getAllPendingReimbursements,
  approveReimbursement,
  rejectReimbursement,
  hrApproveReimbursement,
  hrRejectReimbursement,
  getManagerReimbursementHistory,
  getHRReimbursementHistory
} from '../../services/reimbursementService';
import { LeaveRequest, MissedClockInRequest, ReimbursementRequest } from '../../types';
import { format } from 'date-fns';
import './Approvals.css';

const Approvals: React.FC = () => {
  const { userData, isHRAdmin } = useAuth();
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [missedClockIns, setMissedClockIns] = useState<MissedClockInRequest[]>([]);
  const [pendingReimbursements, setPendingReimbursements] = useState<ReimbursementRequest[]>([]);
  const [historyLeaves, setHistoryLeaves] = useState<LeaveRequest[]>([]);
  const [historyMissed, setHistoryMissed] = useState<MissedClockInRequest[]>([]);
  const [historyReimbursements, setHistoryReimbursements] = useState<ReimbursementRequest[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [selectedMissed, setSelectedMissed] = useState<MissedClockInRequest | null>(null);
  const [selectedReimb, setSelectedReimb] = useState<ReimbursementRequest | null>(null);
  const [comment, setComment] = useState('');
  const [action, setAction] = useState<'approve' | 'reject'>('approve');
  const [error, setError] = useState('');
  const [viewImage, setViewImage] = useState<string | null>(null);

  const fetchPendingData = async () => {
    if (!userData?.uid) return;

    try {
      setLoading(true);
      let leaves: LeaveRequest[];
      let missed: MissedClockInRequest[];
      let reimbs: ReimbursementRequest[];
      let hLeaves: LeaveRequest[];
      let hMissed: MissedClockInRequest[];
      let hReimbs: ReimbursementRequest[];

      if (isHRAdmin) {
        // Fetch both HR queues and Manager queues for HR admins
        const [
          hrLeaves, hrMissed, hrReimbs,
          mgrLeaves, mgrMissed, mgrReimbs,
          fetchedHLeaves, fetchedHMissed, fetchedHReimbs
        ] = await Promise.all([
          getHRPendingLeaves(),
          getAllPendingMissedClockIns(),
          getAllPendingReimbursements(),
          getManagerPendingLeaves(userData.uid),
          getPendingMissedClockIns(userData.uid),
          getPendingReimbursements(userData.uid),
          getHRLeaveHistory(),
          getHRMissedClockInHistory(),
          getHRReimbursementHistory(),
        ]);

        // Merge and deduplicate just in case
        leaves = [...hrLeaves, ...mgrLeaves.filter(m => !hrLeaves.find(h => h.id === m.id))];
        missed = [...hrMissed, ...mgrMissed.filter(m => !hrMissed.find(h => h.id === m.id))];
        reimbs = [...hrReimbs, ...mgrReimbs.filter(m => !hrReimbs.find(h => h.id === m.id))];

        hLeaves = fetchedHLeaves;
        hMissed = fetchedHMissed;
        hReimbs = fetchedHReimbs;

      } else {
        [leaves, missed, reimbs, hLeaves, hMissed, hReimbs] = await Promise.all([
          getManagerPendingLeaves(userData.uid),
          getPendingMissedClockIns(userData.uid),
          getPendingReimbursements(userData.uid),
          getManagerLeaveHistory(userData.uid),
          getManagerMissedClockInHistory(userData.uid),
          getManagerReimbursementHistory(userData.uid),
        ]);
      }

      setPendingLeaves(leaves);
      setMissedClockIns(missed);
      setPendingReimbursements(reimbs);
      setHistoryLeaves(hLeaves);
      setHistoryMissed(hMissed);
      setHistoryReimbursements(hReimbs);
    } catch (error) {
      console.error('Error fetching pending data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.uid, isHRAdmin]);

  const openLeaveModal = (leave: LeaveRequest, actionType: 'approve' | 'reject') => {
    setSelectedLeave(leave);
    setSelectedMissed(null);
    setSelectedReimb(null);
    setAction(actionType);
    setComment('');
    setError('');
    setModalOpen(true);
  };

  const openMissedModal = (missed: MissedClockInRequest, actionType: 'approve' | 'reject') => {
    setSelectedMissed(missed);
    setSelectedLeave(null);
    setSelectedReimb(null);
    setAction(actionType);
    setComment('');
    setError('');
    setModalOpen(true);
  };

  const openReimbModal = (reimb: ReimbursementRequest, actionType: 'approve' | 'reject') => {
    setSelectedReimb(reimb);
    setSelectedLeave(null);
    setSelectedMissed(null);
    setAction(actionType);
    setComment('');
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedLeave(null);
    setSelectedMissed(null);
    setSelectedReimb(null);
  };

  const handleSubmit = async () => {
    if (action === 'reject' && !comment.trim()) {
      setError('Comment is required when rejecting');
      return;
    }

    const activeId = selectedLeave?.id || selectedMissed?.id || selectedReimb?.id;
    if (!activeId) return;

    setProcessingId(activeId);
    setError('');

    try {
      if (selectedLeave) {
        // Handle leave approval/rejection
        if (isHRAdmin && selectedLeave.status === 'pending_hr') {
          await hrApproval(selectedLeave.id, action === 'approve', comment);
        } else {
          await managerDecision(selectedLeave.id, action === 'approve', comment, userData?.name || '');
        }
      } else if (selectedMissed) {
        // Handle missed clock-in approval/rejection
        if (action === 'approve') {
          await approveMissedClockIn(selectedMissed.id, comment);
        } else {
          await rejectMissedClockIn(selectedMissed.id, comment);
        }
      } else if (selectedReimb) {
        // Handle reimbursement approval/rejection
        if (isHRAdmin && selectedReimb.status === 'pending_hr') {
          if (action === 'approve') {
            await hrApproveReimbursement(selectedReimb.id, comment);
          } else {
            await hrRejectReimbursement(selectedReimb.id, comment);
          }
        } else {
          if (action === 'approve') {
            await approveReimbursement(selectedReimb.id, comment);
          } else {
            await rejectReimbursement(selectedReimb.id, comment);
          }
        }
      }

      closeModal();
      fetchPendingData();
    } catch (err: any) {
      setError(err.message || 'Failed to process request');
    } finally {
      setProcessingId(null);
    }
  };

  const formatLeaveType = (type: string) => {
    const types: Record<string, string> = {
      casual: 'Casual Leave',
      paid: 'Paid Leave',
      sick: 'Sick Leave',
      comp_off: 'Comp Off',
      wfh: 'WFH',
      extra_work: 'Extra Day Work',
      menstrual: 'Menstrual Leave',
      bereavement: 'Bereavement Leave'
    };
    return types[type] || type.replace(/_/g, ' ').toUpperCase();
  };

  const totalPending = pendingLeaves.length + missedClockIns.length + pendingReimbursements.length;

  return (
    <div className="approvals">
      <div className="page-header">
        <h1>{isHRAdmin ? 'HR Approvals' : 'Manager Approvals'}</h1>
        <p>Review and process pending requests ({totalPending} total)</p>
      </div>

      {/* Leave Requests Section */}
      <div className="card">
        <div className="card-header">
          <h2>Leave Requests ({pendingLeaves.length})</h2>
          <button className="btn btn-secondary" onClick={fetchPendingData}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : pendingLeaves.length === 0 ? (
          <div className="empty-state">
            <h3>No pending leave requests</h3>
            <p>All leave requests have been processed</p>
          </div>
        ) : (
          <div className="approvals-list">
            {pendingLeaves.map((leave) => (
              <div key={leave.id} className="approval-card">
                <div className="approval-header">
                  <div>
                    <h3>{leave.employeeName}</h3>
                    <span className="employee-email">{leave.employeeEmail}</span>
                  </div>
                  <span className="leave-type-badge">
                    {formatLeaveType(leave.leaveType)}
                  </span>
                </div>

                <div className="approval-body">
                  <div className="approval-row">
                    <div className="approval-detail">
                      <span className="label">Dates</span>
                      <span className="value">
                        {format(new Date(leave.startDate), 'MMM dd, yyyy')} - {format(new Date(leave.endDate), 'MMM dd, yyyy')}
                      </span>
                    </div>
                    <div className="approval-detail">
                      <span className="label">Duration</span>
                      <span className="value">
                        {leave.totalDays} {leave.totalDays === 1 ? 'day' : 'days'}
                        {leave.isHalfDay && ' (Half Day)'}
                      </span>
                    </div>
                  </div>

                  <div className="approval-detail full-width">
                    <span className="label">Reason</span>
                    <span className="value">{leave.reason}</span>
                  </div>

                  {leave.leaveType !== 'wfh' && (
                    <div className="approval-detail full-width">
                      <span className="label">Requested Sources</span>
                      <span className="value">
                        {leave.selectedSources.compOff && 'Comp Off '}
                        {leave.selectedSources.compOff && leave.selectedSources.annualLeave && '+ '}
                        {leave.selectedSources.annualLeave && 'Annual Leave'}
                      </span>
                    </div>
                  )}

                  {isHRAdmin && leave.managerComment && (
                    <div className="approval-detail full-width">
                      <span className="label">Manager ({leave.managerName})</span>
                      <span className="value manager-comment">{leave.managerComment}</span>
                    </div>
                  )}
                </div>

                <div className="approval-footer">
                  <span className="applied-date">
                    Applied {format(new Date(leave.createdAt), 'MMM dd, yyyy')}
                  </span>
                  <div className="btn-group">
                    <button
                      className="btn btn-danger"
                      onClick={() => openLeaveModal(leave, 'reject')}
                      disabled={processingId === leave.id}
                    >
                      Reject
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={() => openLeaveModal(leave, 'approve')}
                      disabled={processingId === leave.id}
                    >
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Missed Clock-In Requests Section */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h2>📝 Missed Clock-In Requests ({missedClockIns.length})</h2>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : missedClockIns.length === 0 ? (
          <div className="empty-state">
            <h3>No pending missed clock-in requests</h3>
            <p>All missed clock-in requests have been processed</p>
          </div>
        ) : (
          <div className="approvals-list">
            {missedClockIns.map((req) => (
              <div key={req.id} className="approval-card">
                <div className="approval-header">
                  <div>
                    <h3>{req.employeeName}</h3>
                    <span className="employee-email">Missed Clock-In</span>
                  </div>
                  <span className="leave-type-badge missed-badge">
                    Missed Attendance
                  </span>
                </div>

                <div className="approval-body">
                  <div className="approval-row">
                    <div className="approval-detail">
                      <span className="label">Date</span>
                      <span className="value">
                        {format(new Date(req.date + 'T00:00:00'), 'EEEE, MMM dd, yyyy')}
                      </span>
                    </div>
                    <div className="approval-detail">
                      <span className="label">Applied</span>
                      <span className="value">
                        {format(new Date(req.createdAt), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="approval-footer">
                  <span className="applied-date">
                    Requested {format(new Date(req.createdAt), 'MMM dd, hh:mm a')}
                  </span>
                  <div className="btn-group">
                    <button
                      className="btn btn-danger"
                      onClick={() => openMissedModal(req, 'reject')}
                      disabled={processingId === req.id}
                    >
                      Reject
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={() => openMissedModal(req, 'approve')}
                      disabled={processingId === req.id}
                    >
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reimbursement Requests Section */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h2>💰 Reimbursement Requests ({pendingReimbursements.length})</h2>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : pendingReimbursements.length === 0 ? (
          <div className="empty-state">
            <h3>No pending reimbursement requests</h3>
            <p>All reimbursement requests have been processed</p>
          </div>
        ) : (
          <div className="approvals-list">
            {pendingReimbursements.map((req) => (
              <div key={req.id} className="approval-card">
                <div className="approval-header">
                  <div>
                    <h3>{req.employeeName}</h3>
                    <span className="employee-email">{req.employeeEmail}</span>
                  </div>
                  <span className="leave-type-badge" style={{ background: '#059669' }}>
                    ₹{req.totalAmount.toFixed(2)}
                  </span>
                </div>

                <div className="approval-body">
                  {req.items.map((item, idx) => (
                    <div key={idx} className="approval-row" style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '8px', marginBottom: '8px' }}>
                      <div className="approval-detail">
                        <span className="label">Item {idx + 1}</span>
                        <span className="value">{item.name}</span>
                      </div>
                      <div className="approval-detail">
                        <span className="label">Amount</span>
                        <span className="value">₹{item.amount.toFixed(2)}</span>
                      </div>
                      <div className="approval-detail">
                        <span className="label">Bills</span>
                        <span className="value" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {item.billUrls.map((url, bIdx) => (
                            <button
                              key={bIdx}
                              type="button"
                              onClick={() => setViewImage(url)}
                              title="Click to view full size"
                              style={{
                                background: 'none',
                                border: '1px solid #e5e7eb',
                                borderRadius: '4px',
                                padding: 0,
                                cursor: 'pointer',
                                overflow: 'hidden'
                              }}
                            >
                              <img
                                src={url}
                                alt={`Bill ${bIdx + 1}`}
                                style={{
                                  width: '40px',
                                  height: '40px',
                                  objectFit: 'cover',
                                  display: 'block'
                                }}
                              />
                            </button>
                          ))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {isHRAdmin && req.managerComment && (
                  <div className="approval-body" style={{ borderTop: '1px solid #f3f4f6', paddingTop: '8px' }}>
                    <div className="approval-detail full-width">
                      <span className="label">Manager Comment ({req.managerName})</span>
                      <span className="value manager-comment">{req.managerComment}</span>
                    </div>
                  </div>
                )}

                <div className="approval-footer">
                  <span className="applied-date">
                    Applied {format(new Date(req.createdAt), 'MMM dd, yyyy')}
                  </span>
                  <div className="btn-group">
                    <button
                      className="btn btn-danger"
                      onClick={() => openReimbModal(req, 'reject')}
                      disabled={processingId === req.id}
                    >
                      Reject
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={() => openReimbModal(req, 'approve')}
                      disabled={processingId === req.id}
                    >
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approval History Section */}
      <div className="card" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
        <div
          className="card-header"
          style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          onClick={() => setShowHistory(!showHistory)}
        >
          <h2>🗄️ Approval History ({historyLeaves.length + historyMissed.length + historyReimbursements.length})</h2>
          <span>{showHistory ? '▲ Hide' : '▼ Show'}</span>
        </div>

        {showHistory && (
          <div className="history-section" style={{ marginTop: '1rem' }}>
            {historyLeaves.length === 0 && historyMissed.length === 0 && historyReimbursements.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#6b7280' }}>No history available</p>
            ) : (
              <div className="approvals-list" style={{ opacity: 0.85 }}>
                {historyLeaves.map(leave => (
                  <div key={leave.id} className="approval-card" style={{ borderLeft: `4px solid ${leave.status === 'approved' ? '#10b981' : '#f43f5e'}` }}>
                    <div className="approval-header">
                      <div>
                        <h3>{leave.employeeName}</h3>
                        <span className="employee-email">Leave Request</span>
                      </div>
                      <span className="leave-type-badge" style={{ background: leave.status === 'approved' ? '#10b981' : '#f43f5e' }}>
                        {leave.status.toUpperCase().replace('_', ' ')}
                      </span>
                    </div>
                    <div className="approval-body">
                      <div className="approval-detail">
                        <span className="label">Type</span>
                        <span className="value">{formatLeaveType(leave.leaveType)}</span>
                      </div>
                      <div className="approval-detail">
                        <span className="label">Dates</span>
                        <span className="value">{format(new Date(leave.startDate), 'MMM dd')} - {format(new Date(leave.endDate), 'MMM dd, yyyy')}</span>
                      </div>
                    </div>
                    <div className="approval-footer">
                      <span>Updated: {format(new Date(leave.updatedAt), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>
                ))}

                {historyMissed.map(req => (
                  <div key={req.id} className="approval-card" style={{ borderLeft: `4px solid ${req.status === 'approved' ? '#10b981' : '#f43f5e'}` }}>
                    <div className="approval-header">
                      <div>
                        <h3>{req.employeeName}</h3>
                        <span className="employee-email">Missed Clock-In</span>
                      </div>
                      <span className="leave-type-badge" style={{ background: req.status === 'approved' ? '#10b981' : '#f43f5e' }}>
                        {req.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="approval-body">
                      <div className="approval-detail">
                        <span className="label">Date</span>
                        <span className="value">{format(new Date(req.date + 'T00:00:00'), 'EEEE, MMM dd, yyyy')}</span>
                      </div>
                    </div>
                    <div className="approval-footer">
                      <span>Updated: {format(new Date(req.updatedAt || req.createdAt), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>
                ))}

                {historyReimbursements.map(req => (
                  <div key={req.id} className="approval-card" style={{ borderLeft: `4px solid ${req.status === 'approved' ? '#10b981' : '#f43f5e'}` }}>
                    <div className="approval-header">
                      <div>
                        <h3>{req.employeeName}</h3>
                        <span className="employee-email">Reimbursement</span>
                      </div>
                      <span className="leave-type-badge" style={{ background: req.status === 'approved' ? '#10b981' : '#f43f5e' }}>
                        {req.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="approval-body">
                      <div className="approval-detail">
                        <span className="label">Amount</span>
                        <span className="value">₹{req.totalAmount.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="approval-footer">
                      <span>Updated: {format(new Date(req.updatedAt || req.createdAt), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Approval Modal (shared for leaves + missed clock-ins + reimbursements) */}
      {modalOpen && (selectedLeave || selectedMissed || selectedReimb) && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {action === 'approve' ? 'Approve' : 'Reject'}{' '}
                {selectedLeave ? 'Leave Request' : selectedMissed ? 'Missed Clock-In' : 'Reimbursement'}
              </h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>

            <div className="modal-body">
              {error && <div className="auth-error">{error}</div>}

              <div className="modal-info">
                <p><strong>Employee:</strong> {selectedLeave?.employeeName || selectedMissed?.employeeName || selectedReimb?.employeeName}</p>
                {selectedLeave && (
                  <>
                    <p><strong>Type:</strong> {formatLeaveType(selectedLeave.leaveType)}</p>
                    <p><strong>Days:</strong> {selectedLeave.totalDays}</p>
                  </>
                )}
                {selectedMissed && (
                  <>
                    <p><strong>Date:</strong> {format(new Date(selectedMissed.date + 'T00:00:00'), 'EEEE, MMM dd, yyyy')}</p>
                  </>
                )}
                {selectedReimb && (
                  <>
                    <p><strong>Total Amount:</strong> ₹{selectedReimb.totalAmount.toFixed(2)}</p>
                    <p><strong>Items:</strong> {selectedReimb.items.map(i => i.name).join(', ')}</p>
                  </>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="comment">
                  Comment {action === 'reject' ? '(Required) *' : '(Optional)'}
                </label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={action === 'reject' ? 'Provide a reason for rejection' : 'Optional comment'}
                  rows={3}
                  required={action === 'reject'}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className={`btn ${action === 'approve' ? 'btn-success' : 'btn-danger'}`}
                onClick={handleSubmit}
                disabled={processingId !== null}
              >
                {processingId ? 'Processing...' : action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Viewer Modal */}
      {viewImage && (
        <div
          className="modal-overlay"
          style={{ zIndex: 10000 }}
          onClick={() => setViewImage(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: '#fff',
              borderRadius: '12px',
              padding: '0.5rem',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setViewImage(null)}
              style={{
                position: 'absolute',
                top: '-12px',
                right: '-12px',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1
              }}
            >
              ✕
            </button>
            <img
              src={viewImage}
              alt="Bill"
              style={{
                maxWidth: '100%',
                maxHeight: '85vh',
                display: 'block',
                borderRadius: '8px'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Approvals;
