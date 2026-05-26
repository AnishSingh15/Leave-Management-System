import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllUsers, adjustCompOffBalance, adjustAnnualLeaveBalance, updateUserRole, toggleUserStatus, getAuditLogs, updateSlackMemberId } from '../../services/userService';
import { getAllLeaves, cancelLeaveRequest } from '../../services/leaveService';
import { getAllReimbursements } from '../../services/reimbursementService';
import { User, UserRole, LeaveRequest, AuditLog, ReimbursementRequest } from '../../types';
import { format } from 'date-fns';
import './AdminPanel.css';

type TabType = 'users' | 'leaves' | 'reimbursements' | 'audit';

const AdminPanel: React.FC = () => {
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [reimbursements, setReimbursements] = useState<ReimbursementRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [modalType, setModalType] = useState<'compOff' | 'annual' | 'role' | 'slackId' | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('employee');
  const [slackId, setSlackId] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);

  // Holiday reminder test state
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [incrementLoading, setIncrementLoading] = useState(false);
  const [incrementResult, setIncrementResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [cronSecret, setCronSecret] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const usersData = await getAllUsers();
        setUsers(usersData);
      } else if (activeTab === 'leaves') {
        const leavesData = await getAllLeaves();
        setLeaves(leavesData);
      } else if (activeTab === 'reimbursements') {
        const reimbData = await getAllReimbursements();
        setReimbursements(reimbData);
      } else if (activeTab === 'audit') {
        const logsData = await getAuditLogs();
        setAuditLogs(logsData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const openAdjustmentModal = (user: User, type: 'compOff' | 'annual') => {
    setSelectedUser(user);
    setModalType(type);
    setAdjustmentAmount('');
    setAdjustmentReason('');
    setError('');
  };

  const openRoleModal = (user: User) => {
    setSelectedUser(user);
    setModalType('role');
    setNewRole(user.role);
    setError('');
  };

  const openSlackIdModal = (user: User) => {
    setSelectedUser(user);
    setModalType('slackId');
    setSlackId(user.slackMemberId || '');
    setError('');
  };

  const closeModal = () => {
    setModalType(null);
    setSelectedUser(null);
  };

  const handleAdjustment = async () => {
    if (!selectedUser || !userData) return;
    
    const amount = parseFloat(adjustmentAmount);
    if (isNaN(amount)) {
      setError('Please enter a valid number');
      return;
    }

    if (!adjustmentReason.trim()) {
      setError('Please provide a reason');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      if (modalType === 'compOff') {
        await adjustCompOffBalance(
          selectedUser.uid,
          amount,
          adjustmentReason,
          userData.uid,
          userData.name
        );
      } else if (modalType === 'annual') {
        await adjustAnnualLeaveBalance(
          selectedUser.uid,
          amount,
          adjustmentReason,
          userData.uid,
          userData.name
        );
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to adjust balance');
    } finally {
      setProcessing(false);
    }
  };

  const handleRoleChange = async () => {
    if (!selectedUser || !userData) return;

    setProcessing(true);
    setError('');

    try {
      await updateUserRole(
        selectedUser.uid,
        newRole,
        userData.uid,
        userData.name
      );
      closeModal();
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update role');
    } finally {
      setProcessing(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    if (!userData) return;
    
    if (user.uid === userData.uid) {
      alert('You cannot deactivate your own account');
      return;
    }

    if (!window.confirm(`Are you sure you want to ${user.isActive ? 'deactivate' : 'activate'} ${user.name}?`)) {
      return;
    }

    try {
      await toggleUserStatus(user.uid, userData.uid, userData.name);
      fetchData();
    } catch (error: any) {
      alert(error.message || 'Failed to update user status');
    }
  };

  const handleSlackIdUpdate = async () => {
    if (!selectedUser || !userData) return;

    setProcessing(true);
    setError('');

    try {
      await updateSlackMemberId(
        selectedUser.uid,
        slackId.trim(),
        userData.uid,
        userData.name
      );
      closeModal();
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update Slack ID');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelLeave = async (leave: LeaveRequest) => {
    if (!window.confirm(`Are you sure you want to cancel this leave request for ${leave.employeeName}?`)) {
      return;
    }

    const reason = window.prompt('Enter reason for cancellation:');
    if (!reason) return;

    try {
      await cancelLeaveRequest(leave.id, reason);
      fetchData();
    } catch (error: any) {
      alert(error.message || 'Failed to cancel leave');
    }
  };

  const getStatusClass = (status: string) => `status-badge ${status}`;
  const formatStatus = (status: string) => 
    status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
  const formatLeaveType = (type: string) => {
    const types: Record<string, string> = {
      earned: 'Earned Leave',
      casual: 'Casual Leave',
      paid: 'Paid Leave',
      comp_off: 'Comp Off',
      wfh: 'WFH',
      extra_work: 'Extra Day Work',
      menstrual: 'Menstrual Leave',
    };
    return types[type] || type.replace(/_/g, ' ').toUpperCase();
  };

  const handleSendHolidayReminder = async (forceAll: boolean) => {
    if (!cronSecret.trim()) {
      setReminderResult({ ok: false, message: 'Please enter the CRON_SECRET from your Vercel environment variables.' });
      return;
    }
    setReminderLoading(true);
    setReminderResult(null);
    try {
      const body: Record<string, unknown> = { force: true };
      if (!forceAll) body.testEmail = 'anish@getmorph.com';
      const res = await fetch('/api/holiday-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cronSecret}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setReminderResult({
          ok: true,
          message: forceAll
            ? `✅ Sent to ${data.sent} employee(s): ${data.sentTo?.join(', ') || ''}`
            : `✅ Test email sent to anish@getmorph.com!`,
        });
      } else {
        setReminderResult({ ok: false, message: data.error || data.message || 'Unknown error' });
      }
    } catch (err: any) {
      setReminderResult({ ok: false, message: err.message || 'Network error' });
    } finally {
      setReminderLoading(false);
    }
  };

  const handleIncrementLeave = async () => {
    if (!cronSecret.trim()) {
      setIncrementResult({ ok: false, message: 'Please enter the CRON_SECRET from your Vercel environment variables.' });
      return;
    }
    if (!window.confirm('This will add 2 annual leave days to ALL active employees. Are you sure?')) return;
    setIncrementLoading(true);
    setIncrementResult(null);
    try {
      const res = await fetch('/api/increment-annual-leave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cronSecret}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setIncrementResult({ ok: true, message: `✅ Added 2 annual leave days to ${data.updatedCount} employee(s).` });
      } else {
        setIncrementResult({ ok: false, message: data.error || data.message || 'Unknown error' });
      }
    } catch (err: any) {
      setIncrementResult({ ok: false, message: err.message || 'Network error' });
    } finally {
      setIncrementLoading(false);
    }
  };

  return (
    <div className="admin-panel">
      <div className="page-header">
        <h1>Admin Panel</h1>
        <p>Manage users, leaves, and system settings</p>
      </div>

      {/* Holiday Reminder Section */}
      {userData?.role === 'master_admin' && (
        <div className="card" style={{ marginBottom: '1.5rem', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div className="card-header" style={{ borderBottom: '1px solid #fde68a' }}>
            <h2 style={{ color: '#92400e' }}>🎉 Holiday Reminder Emails</h2>
          </div>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <p style={{ margin: '0 0 1rem', color: '#78350f', fontSize: '0.92rem' }}>
              Sends a "Holiday Tomorrow" email to all active employees who have an <strong>Employee ID</strong> set.
              The cron runs automatically every day at <strong>10:00 AM IST</strong>. Use the buttons below to trigger manually.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 260px' }}>
                <label style={{ fontSize: '0.83rem', fontWeight: 600, color: '#78350f' }}>CRON_SECRET (from Vercel env vars) *</label>
                <input
                  type="password"
                  value={cronSecret}
                  onChange={e => setCronSecret(e.target.value)}
                  placeholder="Paste your CRON_SECRET here"
                  style={{ padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid #fcd34d', fontSize: '0.9rem' }}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={() => handleSendHolidayReminder(false)}
                disabled={reminderLoading}
                style={{ padding: '0.5rem 1.2rem', background: '#d97706', border: 'none' }}
              >
                {reminderLoading ? 'Sending...' : '📧 Send Test to My Email'}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleSendHolidayReminder(true)}
                disabled={reminderLoading}
                style={{ padding: '0.5rem 1.2rem', background: '#92400e', border: 'none' }}
              >
                {reminderLoading ? 'Sending...' : '📣 Send to All Employees'}
              </button>
            </div>
            {reminderResult && (
              <div style={{
                padding: '10px 14px', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 500,
                background: reminderResult.ok ? '#dcfce7' : '#fee2e2',
                color: reminderResult.ok ? '#166534' : '#991b1b',
              }}>
                {reminderResult.message}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Annual Leave Increment Section */}
      {userData?.role === 'master_admin' && (
        <div className="card" style={{ marginBottom: '1.5rem', background: '#f0fdf4', border: '1px solid #86efac' }}>
          <div className="card-header" style={{ borderBottom: '1px solid #86efac' }}>
            <h2 style={{ color: '#166534' }}>📅 Monthly Annual Leave Increment</h2>
          </div>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <p style={{ margin: '0 0 1rem', color: '#15803d', fontSize: '0.92rem' }}>
              Adds <strong>2 annual leave days</strong> to every active employee's balance.
              The cron runs automatically on the <strong>1st of every month at 12:00 AM IST</strong>.
              Use the button below to trigger manually.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleIncrementLeave}
                disabled={incrementLoading}
                style={{ padding: '0.5rem 1.4rem', background: '#16a34a', border: 'none' }}
              >
                {incrementLoading ? 'Updating...' : '➕ Add 2 Days to All Employees'}
              </button>
            </div>
            {incrementResult && (
              <div style={{
                padding: '10px 14px', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 500,
                background: incrementResult.ok ? '#dcfce7' : '#fee2e2',
                color: incrementResult.ok ? '#166534' : '#991b1b',
              }}>
                {incrementResult.message}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button
          className={`tab ${activeTab === 'leaves' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaves')}
        >
          All Leaves
        </button>
        <button
          className={`tab ${activeTab === 'reimbursements' ? 'active' : ''}`}
          onClick={() => setActiveTab('reimbursements')}
        >
          Reimbursements
        </button>
        <button
          className={`tab ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          Audit Logs
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Emp ID</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Annual Leave</th>
                      <th>Comp Off</th>
                      <th>Status</th>
                      <th>Slack ID</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.uid} className={!user.isActive ? 'inactive-row' : ''}>
                        <td>{user.name}</td>
                        <td>{user.employeeId || '—'}</td>
                        <td>{user.email}</td>
                        <td>
                          <span className={`role-badge ${user.role}`}>
                            {user.role.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td>{user.annualLeaveBalance} / 20</td>
                        <td>{user.compOffBalance}</td>
                        <td>
                          <span className={`status-indicator ${user.isActive ? 'active' : 'inactive'}`}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <span className={`slack-id-cell ${user.slackMemberId ? 'set' : 'not-set'}`}>
                            {user.slackMemberId || '—'}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn-action"
                              onClick={() => openAdjustmentModal(user, 'compOff')}
                              title="Adjust Comp Off"
                            >
                              +/- CO
                            </button>
                            <button
                              className="btn-action"
                              onClick={() => openAdjustmentModal(user, 'annual')}
                              title="Adjust Annual Leave"
                            >
                              +/- AL
                            </button>
                            <button
                              className="btn-action"
                              onClick={() => openRoleModal(user)}
                              title="Change Role"
                            >
                              Role
                            </button>
                            <button
                              className="btn-action slack"
                              onClick={() => openSlackIdModal(user)}
                              title="Set Slack Member ID"
                            >
                              Slack
                            </button>
                            <button
                              className={`btn-action ${user.isActive ? 'danger' : 'success'}`}
                              onClick={() => handleToggleStatus(user)}
                              title={user.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {user.isActive ? 'Deact' : 'Act'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Leaves Tab */}
            {activeTab === 'leaves' && (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Days</th>
                      <th>Status</th>
                      <th>Deduction</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((leave) => (
                      <tr key={leave.id}>
                        <td>{leave.employeeName}</td>
                        <td>{formatLeaveType(leave.leaveType)}</td>
                        <td>
                          {format(new Date(leave.startDate), 'MMM dd')} - {format(new Date(leave.endDate), 'MMM dd, yyyy')}
                        </td>
                        <td>{leave.totalDays}</td>
                        <td>
                          <span className={getStatusClass(leave.status)}>
                            {formatStatus(leave.status)}
                          </span>
                        </td>
                        <td>
                          {leave.status === 'approved' && leave.leaveType !== 'wfh' ? (
                            <span>CO: {leave.compOffUsed}, AL: {leave.annualLeaveUsed}</span>
                          ) : '-'}
                        </td>
                        <td>
                          {(leave.status === 'approved' || leave.status === 'pending_manager' || leave.status === 'pending_hr') && (
                            <button
                              className="btn-action danger"
                              onClick={() => handleCancelLeave(leave)}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Reimbursements Tab */}
            {activeTab === 'reimbursements' && (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Items</th>
                      <th>Total Amount</th>
                      <th>Manager</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Manager Comment</th>
                      <th>HR Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reimbursements.map((req) => (
                      <tr key={req.id}>
                        <td>{req.employeeName}</td>
                        <td>
                          {req.items.map((item, idx) => (
                            <div key={idx} style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                              {item.name} — ₹{item.amount.toFixed(2)}
                              <div style={{ display: 'inline-flex', marginLeft: '6px', gap: '4px' }}>
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
                                        width: '30px', 
                                        height: '30px', 
                                        objectFit: 'cover', 
                                        display: 'block'
                                      }}
                                    />
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </td>
                        <td><strong>₹{req.totalAmount.toFixed(2)}</strong></td>
                        <td>{req.managerName}</td>
                        <td>
                          <span className={getStatusClass(req.status)}>
                            {formatStatus(req.status)}
                          </span>
                        </td>
                        <td>{format(new Date(req.createdAt), 'MMM dd, yyyy')}</td>
                        <td>{req.managerComment || '—'}</td>
                        <td>{req.hrComment || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Audit Logs Tab */}
            {activeTab === 'audit' && (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>Performed By</th>
                      <th>Target User</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm')}</td>
                        <td>
                          <span className="action-badge">{log.action.replace(/_/g, ' ')}</span>
                        </td>
                        <td>{log.performedByName}</td>
                        <td>{log.targetUserName || '-'}</td>
                        <td>{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Balance Adjustment Modal */}
      {(modalType === 'compOff' || modalType === 'annual') && selectedUser && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Adjust {modalType === 'compOff' ? 'Comp Off' : 'Annual Leave'}</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>

            <div className="modal-body">
              {error && <div className="auth-error">{error}</div>}

              <div className="modal-info">
                <p><strong>Employee:</strong> {selectedUser.name}</p>
                <p><strong>Current Balance:</strong> {
                  modalType === 'compOff' 
                    ? `${selectedUser.compOffBalance} days`
                    : `${selectedUser.annualLeaveBalance} / 20 days`
                }</p>
              </div>

              <div className="form-group">
                <label>Adjustment Amount (use negative to deduct)</label>
                <input
                  type="number"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  placeholder="e.g., 2 or -1"
                  step="0.5"
                />
              </div>

              <div className="form-group">
                <label>Reason *</label>
                <textarea
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder="Provide a reason for this adjustment"
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAdjustment}
                disabled={processing}
              >
                {processing ? 'Processing...' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Change Modal */}
      {modalType === 'role' && selectedUser && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Change User Role</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>

            <div className="modal-body">
              {error && <div className="auth-error">{error}</div>}

              <div className="modal-info">
                <p><strong>Employee:</strong> {selectedUser.name}</p>
                <p><strong>Current Role:</strong> {selectedUser.role.replace('_', ' ').toUpperCase()}</p>
              </div>

              <div className="form-group">
                <label>New Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="hr_admin">HR Admin</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRoleChange}
                disabled={processing || newRole === selectedUser.role}
              >
                {processing ? 'Processing...' : 'Update Role'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Slack ID Modal */}
      {modalType === 'slackId' && selectedUser && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Set Slack Member ID</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>

            <div className="modal-body">
              {error && <div className="auth-error">{error}</div>}

              <div className="modal-info">
                <p><strong>Employee:</strong> {selectedUser.name}</p>
                <p><strong>Current Slack ID:</strong> {selectedUser.slackMemberId || 'Not set'}</p>
              </div>

              <div className="form-group">
                <label>Slack Member ID</label>
                <input
                  type="text"
                  value={slackId}
                  onChange={(e) => setSlackId(e.target.value)}
                  placeholder="e.g., U04ABCD1234"
                />
                <small style={{ color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Find this in Slack → Profile → ⋮ → Copy member ID
                </small>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSlackIdUpdate}
                disabled={processing}
              >
                {processing ? 'Saving...' : 'Save Slack ID'}
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

export default AdminPanel;
