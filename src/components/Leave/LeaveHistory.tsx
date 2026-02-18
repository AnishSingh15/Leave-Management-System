import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getEmployeeLeaves } from '../../services/leaveService';
import { LeaveRequest } from '../../types';
import { format } from 'date-fns';
import './LeaveHistory.css';

const LeaveHistory: React.FC = () => {
  const { userData } = useAuth();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const fetchLeaves = async () => {
      if (userData?.uid) {
        try {
          const data = await getEmployeeLeaves(userData.uid);
          setLeaves(data);
        } catch (error) {
          console.error('Error fetching leaves:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchLeaves();
  }, [userData?.uid]);

  const getStatusClass = (status: string) => `status-badge ${status}`;

  const formatStatus = (status: string) => 
    status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

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

  const filteredLeaves = filter === 'all' 
    ? leaves 
    : leaves.filter(l => l.status === filter);

  return (
    <div className="leave-history">
      <div className="page-header">
        <h1>My Leave Requests</h1>
        <p>View and track all your leave applications</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Leave History</h2>
          <div className="filter-group">
            <label>Filter by Status:</label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="pending_manager">Pending Manager</option>
              <option value="pending_hr">Pending HR</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading">Loading...</div>
        ) : filteredLeaves.length === 0 ? (
          <div className="empty-state">
            <h3>No leave requests found</h3>
            <p>{filter === 'all' ? 'You haven\'t applied for any leaves yet' : 'No leaves match the selected filter'}</p>
          </div>
        ) : (
          <div className="leaves-list">
            {filteredLeaves.map((leave) => (
              <div key={leave.id} className="leave-card">
                <div className="leave-card-header">
                  <div className="leave-type">{formatLeaveType(leave.leaveType)}</div>
                  <span className={getStatusClass(leave.status)}>
                    {formatStatus(leave.status)}
                  </span>
                </div>
                
                <div className="leave-card-body">
                  <div className="leave-detail">
                    <span className="detail-label">Dates:</span>
                    <span className="detail-value">
                      {format(new Date(leave.startDate), 'MMM dd, yyyy')} - {format(new Date(leave.endDate), 'MMM dd, yyyy')}
                    </span>
                  </div>
                  
                  <div className="leave-detail">
                    <span className="detail-label">Duration:</span>
                    <span className="detail-value">
                      {leave.totalDays} {leave.totalDays === 1 ? 'day' : 'days'}
                      {leave.isHalfDay && ' (Half Day)'}
                    </span>
                  </div>
                  
                  <div className="leave-detail">
                    <span className="detail-label">Manager:</span>
                    <span className="detail-value">{leave.managerName}</span>
                  </div>
                  
                  <div className="leave-detail">
                    <span className="detail-label">Reason:</span>
                    <span className="detail-value">{leave.reason}</span>
                  </div>

                  {leave.status === 'approved' && leave.leaveType !== 'wfh' && (
                    <div className="deduction-info">
                      <h4>Leave Deduction</h4>
                      <div className="deduction-details">
                        {leave.compOffUsed > 0 && (
                          <span>Comp Off: {leave.compOffUsed} days</span>
                        )}
                        {leave.annualLeaveUsed > 0 && (
                          <span>Annual Leave: {leave.annualLeaveUsed} days</span>
                        )}
                        {leave.hrOverride && (
                          <span className="hr-override">HR Override Applied</span>
                        )}
                      </div>
                    </div>
                  )}

                  {leave.managerComment && (
                    <div className="comment-section">
                      <span className="comment-label">Manager Comment:</span>
                      <p className="comment-text">{leave.managerComment}</p>
                    </div>
                  )}

                  {leave.hrComment && (
                    <div className="comment-section">
                      <span className="comment-label">HR Comment:</span>
                      <p className="comment-text">{leave.hrComment}</p>
                    </div>
                  )}
                </div>

                <div className="leave-card-footer">
                  <span>Applied on {format(new Date(leave.createdAt), 'MMM dd, yyyy hh:mm a')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaveHistory;
