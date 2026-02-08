import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getEmployeeLeaves } from '../../services/leaveService';
import { LeaveRequest } from '../../types';
import { format } from 'date-fns';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const { userData } = useAuth();
  const [recentLeaves, setRecentLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (userData?.uid) {
        try {
          const leaves = await getEmployeeLeaves(userData.uid);
          setRecentLeaves(leaves.slice(0, 5));
        } catch (error) {
          console.error('Error fetching leaves:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchData();
  }, [userData?.uid]);

  const getStatusClass = (status: string) => {
    return `status-badge ${status}`;
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const pendingCount = recentLeaves.filter(
    l => l.status === 'pending_manager' || l.status === 'pending_hr'
  ).length;

  const approvedCount = recentLeaves.filter(l => l.status === 'approved').length;

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Welcome, {userData?.name}!</h1>
        <p>Manage your leaves and attendance from here</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-value">{userData?.annualLeaveBalance || 0}</div>
          <div className="stat-label">Annual Leave Balance (of 14)</div>
        </div>
        
        <div className="stat-card success">
          <div className="stat-value">{userData?.compOffBalance || 0}</div>
          <div className="stat-label">Comp Off Balance</div>
        </div>
        
        <div className="stat-card warning">
          <div className="stat-value">{pendingCount}</div>
          <div className="stat-label">Pending Requests</div>
        </div>
        
        <div className="stat-card info">
          <div className="stat-value">{approvedCount}</div>
          <div className="stat-label">Approved This Year</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Recent Leave Requests</h2>
        </div>
        
        {loading ? (
          <div className="loading">Loading...</div>
        ) : recentLeaves.length === 0 ? (
          <div className="empty-state">
            <h3>No leave requests yet</h3>
            <p>Apply for your first leave to get started</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th>Applied On</th>
                </tr>
              </thead>
              <tbody>
                {recentLeaves.map((leave) => (
                  <tr key={leave.id}>
                    <td>{leave.leaveType.replace(/_/g, ' ').toUpperCase()}</td>
                    <td>
                      {format(new Date(leave.startDate), 'MMM dd, yyyy')} - {format(new Date(leave.endDate), 'MMM dd, yyyy')}
                    </td>
                    <td>{leave.totalDays} {leave.isHalfDay ? '(Half Day)' : ''}</td>
                    <td>
                      <span className={getStatusClass(leave.status)}>
                        {formatStatus(leave.status)}
                      </span>
                    </td>
                    <td>{format(new Date(leave.createdAt), 'MMM dd, yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="dashboard-info">
        <div className="card">
          <h3>Leave Deduction Rules</h3>
          <ul>
            <li>Comp Off will be deducted first if selected</li>
            <li>Annual Leave will be deducted for remaining days</li>
            <li>Work From Home (WFH) does not affect leave balance</li>
            <li>Final deduction happens only after HR approval</li>
          </ul>
        </div>
        
        <div className="card">
          <h3>Need Help?</h3>
          <p>Contact HR for any leave-related queries or balance adjustments.</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
