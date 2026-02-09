import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getManagerPendingLeaves, 
  getHRPendingLeaves,
  managerDecision,
  hrApproval
} from '../../services/leaveService';
import { LeaveRequest } from '../../types';
import { format } from 'date-fns';
import './Approvals.css';

const Approvals: React.FC = () => {
  const { userData, isHRAdmin } = useAuth();
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [comment, setComment] = useState('');
  const [action, setAction] = useState<'approve' | 'reject'>('approve');
  const [error, setError] = useState('');

  // HR Override fields
  const [overrideCompOff, setOverrideCompOff] = useState<string>('');
  const [overrideAnnualLeave, setOverrideAnnualLeave] = useState<string>('');
  const [useOverride, setUseOverride] = useState(false);

  const fetchPendingLeaves = async () => {
    if (!userData?.uid) return;
    
    try {
      setLoading(true);
      let leaves: LeaveRequest[];
      
      if (isHRAdmin) {
        leaves = await getHRPendingLeaves();
      } else {
        leaves = await getManagerPendingLeaves(userData.uid);
      }
      
      setPendingLeaves(leaves);
    } catch (error) {
      console.error('Error fetching pending leaves:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingLeaves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData?.uid, isHRAdmin]);

  const openModal = (leave: LeaveRequest, actionType: 'approve' | 'reject') => {
    setSelectedLeave(leave);
    setAction(actionType);
    setComment('');
    setUseOverride(false);
    setOverrideCompOff('');
    setOverrideAnnualLeave('');
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedLeave(null);
  };

  const handleSubmit = async () => {
    if (!comment.trim()) {
      setError('Comment is required');
      return;
    }

    if (!selectedLeave) return;

    setProcessingId(selectedLeave.id);
    setError('');

    try {
      if (isHRAdmin) {
        // HR approval with optional override
        const compOff = useOverride && overrideCompOff ? parseFloat(overrideCompOff) : undefined;
        const annual = useOverride && overrideAnnualLeave ? parseFloat(overrideAnnualLeave) : undefined;
        
        await hrApproval(
          selectedLeave.id,
          action === 'approve',
          comment,
          compOff,
          annual
        );
      } else {
        // Manager approval
        await managerDecision(
          selectedLeave.id,
          action === 'approve',
          comment,
          userData?.name || ''
        );
      }

      closeModal();
      fetchPendingLeaves();
    } catch (err: any) {
      setError(err.message || 'Failed to process request');
    } finally {
      setProcessingId(null);
    }
  };

  const formatLeaveType = (type: string) => 
    type.replace(/_/g, ' ').toUpperCase();

  return (
    <div className="approvals">
      <div className="page-header">
        <h1>{isHRAdmin ? 'HR Approvals' : 'Manager Approvals'}</h1>
        <p>Review and process pending leave requests</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Pending Requests ({pendingLeaves.length})</h2>
          <button className="btn btn-secondary" onClick={fetchPendingLeaves}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : pendingLeaves.length === 0 ? (
          <div className="empty-state">
            <h3>No pending requests</h3>
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
                      onClick={() => openModal(leave, 'reject')}
                      disabled={processingId === leave.id}
                    >
                      Reject
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={() => openModal(leave, 'approve')}
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

      {/* Approval Modal */}
      {modalOpen && selectedLeave && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{action === 'approve' ? 'Approve' : 'Reject'} Leave Request</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>

            <div className="modal-body">
              {error && <div className="auth-error">{error}</div>}

              <div className="modal-info">
                <p><strong>Employee:</strong> {selectedLeave.employeeName}</p>
                <p><strong>Type:</strong> {formatLeaveType(selectedLeave.leaveType)}</p>
                <p><strong>Days:</strong> {selectedLeave.totalDays}</p>
              </div>

              <div className="form-group">
                <label htmlFor="comment">Comment (Required) *</label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Provide a comment for your decision"
                  rows={3}
                  required
                />
              </div>

              {isHRAdmin && action === 'approve' && selectedLeave.leaveType !== 'wfh' && (
                <div className="override-section">
                  <div className="checkbox-item">
                    <input
                      type="checkbox"
                      id="useOverride"
                      checked={useOverride}
                      onChange={(e) => setUseOverride(e.target.checked)}
                    />
                    <label htmlFor="useOverride">Override Leave Source</label>
                  </div>

                  {useOverride && (
                    <div className="override-fields">
                      <div className="form-group">
                        <label htmlFor="overrideCompOff">Comp Off Days to Deduct</label>
                        <input
                          type="number"
                          id="overrideCompOff"
                          value={overrideCompOff}
                          onChange={(e) => setOverrideCompOff(e.target.value)}
                          min="0"
                          step="0.5"
                          max={selectedLeave.totalDays}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="overrideAnnualLeave">Annual Leave Days to Deduct</label>
                        <input
                          type="number"
                          id="overrideAnnualLeave"
                          value={overrideAnnualLeave}
                          onChange={(e) => setOverrideAnnualLeave(e.target.value)}
                          min="0"
                          step="0.5"
                          max={selectedLeave.totalDays}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className={`btn ${action === 'approve' ? 'btn-success' : 'btn-danger'}`}
                onClick={handleSubmit}
                disabled={processingId === selectedLeave.id}
              >
                {processingId === selectedLeave.id ? 'Processing...' : action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Approvals;
