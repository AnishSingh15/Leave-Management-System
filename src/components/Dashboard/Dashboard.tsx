import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getEmployeeLeaves } from '../../services/leaveService';
import { LeaveRequest } from '../../types';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import LeaveCalendar from '../Calendar/LeaveCalendar';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const { userData } = useAuth();
  const [recentLeaves, setRecentLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [menstrualTaken, setMenstrualTaken] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (userData?.uid) {
        try {
          const leaves = await getEmployeeLeaves(userData.uid);
          setRecentLeaves(leaves.slice(0, 5));

          // Check for menstrual leave in current month
          const today = new Date();
          const start = startOfMonth(today);
          const end = endOfMonth(today);
          
          const hasMenstrual = leaves.some(l => 
            l.leaveType === 'menstrual' && 
            ['approved', 'pending_manager', 'pending_hr'].includes(l.status) &&
            new Date(l.startDate) >= start &&
            new Date(l.startDate) <= end
          );
          setMenstrualTaken(hasMenstrual);
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
          <div className="stat-label">Annual Leave Balance (of 20)</div>
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
        
        <div className="stat-card" style={{ background: '#fdf4ff', borderLeft: '4px solid #d946ef' }}>
          <div className="stat-value" style={{ color: '#d946ef' }}>
            {menstrualTaken ? 'Taken' : 'Available'}
          </div>
          <div className="stat-label" style={{ color: '#86198f' }}>Menstrual Leave ({format(new Date(), 'MMMM')})</div>
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
                    <td>{formatLeaveType(leave.leaveType)}</td>
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

      <div className="dashboard-calendar-section">
        <div className="card">
          <div className="card-header">
            <h2>Calendar</h2>
          </div>
          <LeaveCalendar />
        </div>
      </div>

      <div className="dashboard-info">
        <div className="card">
          <h3>Leave Deduction Rules</h3>
          <ul>
            <li>Comp Off will be deducted first if selected</li>
            <li>Annual Leave will be deducted for remaining days</li>
            <li>Work From Home (WFH) does not affect leave balance</li>
        
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
