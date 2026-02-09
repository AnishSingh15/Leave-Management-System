import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllUsers, adjustCompOffBalance, adjustAnnualLeaveBalance, updateUserRole, toggleUserStatus, getAuditLogs } from '../../services/userService';
import { getAllLeaves, cancelLeaveRequest } from '../../services/leaveService';
import { User, UserRole, LeaveRequest, AuditLog } from '../../types';
import { format } from 'date-fns';
import './AdminPanel.css';

type TabType = 'users' | 'leaves' | 'audit';

const AdminPanel: React.FC = () => {
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [modalType, setModalType] = useState<'compOff' | 'annual' | 'role' | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('employee');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const usersData = await getAllUsers();
        setUsers(usersData);
      } else if (activeTab === 'leaves') {
        const leavesData = await getAllLeaves();
        setLeaves(leavesData);
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

  return (
    <div className="admin-panel">
      <div className="page-header">
        <h1>HR Admin Panel</h1>
        <p>Manage users, leaves, and system settings</p>
      </div>

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
                      <th>Email</th>
                      <th>Role</th>
                      <th>Annual Leave</th>
                      <th>Comp Off</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.uid} className={!user.isActive ? 'inactive-row' : ''}>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td>
                          <span className={`role-badge ${user.role}`}>
                            {user.role.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td>{user.annualLeaveBalance} / 14</td>
                        <td>{user.compOffBalance}</td>
                        <td>
                          <span className={`status-indicator ${user.isActive ? 'active' : 'inactive'}`}>
                            {user.isActive ? 'Active' : 'Inactive'}
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
                        <td>{leave.leaveType.replace(/_/g, ' ').toUpperCase()}</td>
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
                    : `${selectedUser.annualLeaveBalance} / 14 days`
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
    </div>
  );
};

export default AdminPanel;
