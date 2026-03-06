import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getEmployeeLeaves } from '../../services/leaveService';
import { getTodayAttendance, clockIn, submitMissedClockIn, getEmployeeMissedClockIns } from '../../services/attendanceService';
import { getManagers } from '../../services/userService';
import { LeaveRequest, AttendanceRecord, MissedClockInRequest, User } from '../../types';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
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

  // Missed clock-in state
  const [missedDate, setMissedDate] = useState('');
  const [missedManagerId, setMissedManagerId] = useState('');
  const [managers, setManagers] = useState<User[]>([]);
  const [missedRequests, setMissedRequests] = useState<MissedClockInRequest[]>([]);
  const [missedLoading, setMissedLoading] = useState(false);
  const [missedError, setMissedError] = useState('');
  const [missedSuccess, setMissedSuccess] = useState('');

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

          // Fetch managers and missed requests
          const mgrs = await getManagers();
          setManagers(mgrs.filter(m => m.uid !== userData.uid));
          const missed = await getEmployeeMissedClockIns(userData.uid);
          setMissedRequests(missed);
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

  const handleMissedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMissedError('');
    setMissedSuccess('');
    if (!missedDate || !missedManagerId) {
      setMissedError('Please select both a date and a manager.');
      return;
    }
    const selectedManager = managers.find(m => m.uid === missedManagerId);
    if (!selectedManager || !userData) return;

    setMissedLoading(true);
    try {
      await submitMissedClockIn(userData, missedDate, missedManagerId, selectedManager.name);
      setMissedSuccess('Request submitted! Waiting for manager approval.');
      setMissedDate('');
      setMissedManagerId('');
      const missed = await getEmployeeMissedClockIns(userData.uid);
      setMissedRequests(missed);
    } catch (err: any) {
      setMissedError(err.message || 'Failed to submit request');
    } finally {
      setMissedLoading(false);
    }
  };

  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

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
              <span className="status-badge approved" style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}>Present</span>
            </div>
          )}
        </div>
      </div>

      {/* Missed Clock-In Request */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2>Missed Attendance Request</h2>
        </div>
        <div style={{ padding: '0 1.5rem 1.5rem' }}>
          <p style={{ color: '#64748b', margin: '0 0 1rem' }}>Forgot to clock in on a past date? Submit a request for manager approval.</p>
          {missedError && <div style={{ color: '#dc2626', background: '#fee2e2', padding: '8px 12px', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.9rem' }}>{missedError}</div>}
          {missedSuccess && <div style={{ color: '#166534', background: '#dcfce7', padding: '8px 12px', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.9rem' }}>{missedSuccess}</div>}
          <form onSubmit={handleMissedSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 180px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Date *</label>
              <input
                type="date"
                value={missedDate}
                onChange={(e) => setMissedDate(e.target.value)}
                max={yesterday}
                required
                style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 220px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Approving Manager *</label>
              <select
                value={missedManagerId}
                onChange={(e) => setMissedManagerId(e.target.value)}
                required
                style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="">Select Manager</option>
                {managers.map(m => (
                  <option key={m.uid} value={m.uid}>{m.name}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={missedLoading}
              style={{ padding: '0.5rem 1.5rem', fontWeight: 'bold' }}
            >
              {missedLoading ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>

          {missedRequests.length > 0 && (
            <div style={{ marginTop: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', color: '#334155' }}>Your Requests</h4>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Manager</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missedRequests.slice(0, 5).map((req) => (
                      <tr key={req.id}>
                        <td>{format(new Date(req.date + 'T00:00:00'), 'dd MMM yyyy')}</td>
                        <td>{req.managerName}</td>
                        <td>
                          <span className={`status-badge ${req.status === 'approved' ? 'approved' : req.status === 'rejected' ? 'rejected' : 'pending_manager'}`}>
                            {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
