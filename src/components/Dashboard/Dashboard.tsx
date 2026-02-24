import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getEmployeeLeaves } from '../../services/leaveService';
import { getTodayAttendance, clockIn } from '../../services/attendanceService';
import { LeaveRequest, AttendanceRecord } from '../../types';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import LeaveCalendar from '../Calendar/LeaveCalendar';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const { userData } = useAuth();
  const [recentLeaves, setRecentLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [menstrualTaken, setMenstrualTaken] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [clockInLoading, setClockInLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

          const attendance = await getTodayAttendance(userData.uid);
          setTodayAttendance(attendance);
        } catch (error) {
          console.error('Error fetching dashboard data:', error);
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

      {error && (
        <div className="error-message" style={{ marginBottom: '1rem', color: '#dc2626', background: '#fee2e2', padding: '10px', borderRadius: '4px' }}>
          {error}
        </div>
      )}

      {/* Clock In Widget */}
      <div className="card" style={{ marginBottom: '1.5rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
          <h2>Daily Attendance</h2>
        </div>
        <div style={{ padding: '0 1.5rem 1.5rem' }}>
          {!todayAttendance ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <p style={{ margin: 0, color: '#64748b' }}>You haven't clocked in today.</p>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    setError(null);
                    setClockInLoading(true);
                    if (userData) {
                      const record = await clockIn(userData);
                      setTodayAttendance(record);
                    }
                  } catch (err: any) {
                    setError(err.message || 'Failed to clock in');
                  } finally {
                    setClockInLoading(false);
                  }
                }}
                disabled={clockInLoading}
                style={{ padding: '0.5rem 1.5rem', fontWeight: 'bold' }}
              >
                {clockInLoading ? 'Clocking In...' : 'Clock In Now'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {todayAttendance.status === 'clocked_in' ? (
                <>
                  <span className="status-badge approved" style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}>Clocked In</span>
                  <p style={{ margin: 0, color: '#334155' }}>
                    <strong>Time:</strong> {format(new Date(todayAttendance.clockInTime), 'hh:mm a')}
                  </p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>(Auto log-out scheduled for 7:00 PM IST)</p>
                </>
              ) : (
                <>
                  <span className="status-badge warning" style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}>Auto Logged Out</span>
                  <p style={{ margin: 0, color: '#334155' }}>
                    <strong>Clocked out at:</strong> 07:00 PM
                  </p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>(Clock-in time was {format(new Date(todayAttendance.clockInTime), 'hh:mm a')})</p>
                </>
              )}
            </div>
          )}
        </div>
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
