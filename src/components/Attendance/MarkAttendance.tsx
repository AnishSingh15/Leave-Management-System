import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    clockIn,
    getTodayAttendance,
    getUserAttendanceHistory,
    submitMissedClockIn,
    getEmployeeMissedClockIns,
} from '../../services/attendanceService';
import { getManagers } from '../../services/userService';
import { AttendanceRecord, MissedClockInRequest, User } from '../../types';
import { format } from 'date-fns';
import './MarkAttendance.css';

const MarkAttendance: React.FC = () => {
    const { userData } = useAuth();
    const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
    const [monthHistory, setMonthHistory] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [clocking, setClocking] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Missed clock-in state
    const [missedDate, setMissedDate] = useState('');
    const [missedManagerId, setMissedManagerId] = useState('');
    const [managers, setManagers] = useState<User[]>([]);
    const [submittingMissed, setSubmittingMissed] = useState(false);
    const [missedRequests, setMissedRequests] = useState<MissedClockInRequest[]>([]);
    const [missedError, setMissedError] = useState('');
    const [missedSuccess, setMissedSuccess] = useState('');

    const now = new Date();
    const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
    const [viewYear, setViewYear] = useState(now.getFullYear());

    useEffect(() => {
        const fetchData = async () => {
            if (!userData?.uid) return;
            setLoading(true);
            try {
                const [today, history] = await Promise.all([
                    getTodayAttendance(userData.uid),
                    getUserAttendanceHistory(userData.uid, viewYear, viewMonth),
                ]);
                setTodayRecord(today);
                setMonthHistory(history);
            } catch (err) {
                console.error('Error fetching attendance:', err);
            }

            // Fetch managers separately so a failure here doesn't break everything
            try {
                const managerList = await getManagers();
                console.log('Fetched managers:', managerList);
                setManagers(managerList.filter(m => m.uid !== userData.uid));
            } catch (err) {
                console.error('Error fetching managers:', err);
            }

            // Fetch missed clock-in requests separately
            try {
                const missed = await getEmployeeMissedClockIns(userData.uid);
                setMissedRequests(missed);
            } catch (err) {
                console.error('Error fetching missed clock-ins:', err);
            }

            setLoading(false);
        };

        fetchData();
    }, [userData?.uid, viewMonth, viewYear]);

    const handleClockIn = async () => {
        if (!userData) return;
        setClocking(true);
        setError('');
        setSuccess('');

        try {
            const record = await clockIn(userData);
            setTodayRecord(record);
            setSuccess('You have successfully clocked in! 🎉');

            // Refresh history
            const history = await getUserAttendanceHistory(userData.uid, viewYear, viewMonth);
            setMonthHistory(history);
        } catch (err: any) {
            setError(err.message || 'Failed to clock in');
        } finally {
            setClocking(false);
        }
    };

    const handleMissedSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userData) return;

        setMissedError('');
        setMissedSuccess('');

        if (!missedDate || !missedManagerId) {
            setMissedError('Please fill all fields.');
            return;
        }

        const selectedManager = managers.find(m => m.uid === missedManagerId);
        if (!selectedManager) {
            setMissedError('Please select a valid manager.');
            return;
        }

        setSubmittingMissed(true);
        try {
            await submitMissedClockIn(userData, missedDate, missedManagerId, selectedManager.name);
            setMissedSuccess('Missed clock-in request submitted for manager approval! ✅');
            setMissedDate('');
            setMissedManagerId('');

            // Refresh requests
            const missed = await getEmployeeMissedClockIns(userData.uid);
            setMissedRequests(missed);
        } catch (err: any) {
            setMissedError(err.message || 'Failed to submit request');
        } finally {
            setSubmittingMissed(false);
        }
    };

    const getStatusDisplay = () => {
        if (!todayRecord) return { text: 'Not clocked in yet', class: 'not-clocked' };
        if (todayRecord.status === 'auto_logged_out') return { text: 'Auto logged out at 7:00 PM', class: 'logged-out' };
        return { text: `Clocked in at ${format(new Date(todayRecord.clockInTime), 'hh:mm a')}`, class: 'clocked-in' };
    };

    const statusDisplay = getStatusDisplay();
    const isClockedIn = todayRecord !== null;

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const handlePrevMonth = () => {
        if (viewMonth === 1) { setViewMonth(12); setViewYear(viewYear - 1); }
        else setViewMonth(viewMonth - 1);
    };

    const handleNextMonth = () => {
        if (viewMonth === 12) { setViewMonth(1); setViewYear(viewYear + 1); }
        else setViewMonth(viewMonth + 1);
    };

    // Get yesterday's date for max on the missed date picker
    const getYesterdayIST = (): string => {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + (istOffset + now.getTimezoneOffset() * 60 * 1000));
        istDate.setDate(istDate.getDate() - 1);
        return istDate.toISOString().split('T')[0];
    };

    const getMissedStatusBadge = (status: string) => {
        switch (status) {
            case 'approved': return 'approved';
            case 'rejected': return 'rejected';
            default: return 'pending';
        }
    };

    return (
        <div className="mark-attendance">
            <div className="page-header">
                <h1>Attendance</h1>
                <p>Mark your daily attendance</p>
            </div>

            {/* Today's Status Card */}
            <div className="attendance-today-card">
                <div className="today-header">
                    <h2>Today — {format(new Date(), 'EEEE, MMMM d, yyyy')}</h2>
                </div>

                <div className={`today-status ${statusDisplay.class}`}>
                    <div className="status-icon">
                        {!todayRecord ? '⏳' : todayRecord.status === 'auto_logged_out' ? '🏠' : '✅'}
                    </div>
                    <div className="status-text">{statusDisplay.text}</div>
                </div>

                {error && <div className="attendance-error">{error}</div>}
                {success && <div className="attendance-success">{success}</div>}

                <button
                    className={`clock-in-button ${isClockedIn ? 'disabled' : ''}`}
                    onClick={handleClockIn}
                    disabled={isClockedIn || clocking}
                >
                    {clocking ? 'Clocking in...' : isClockedIn ? '✓ Already Clocked In' : '🚀 Start Working'}
                </button>

                {todayRecord && (
                    <div className="today-details">
                        <div className="detail-item">
                            <span className="detail-label">Clock In</span>
                            <span className="detail-value">{format(new Date(todayRecord.clockInTime), 'hh:mm a')}</span>
                        </div>
                        <div className="detail-item">
                            <span className="detail-label">Auto Logout</span>
                            <span className="detail-value">7:00 PM</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Missed Clock-In Request Form */}
            <div className="card missed-clockin-card">
                <div className="card-header">
                    <h2>📝 Apply for Missed Clock-In</h2>
                </div>
                <p className="missed-desc">Forgot to clock in on a past date? Submit a request for manager approval.</p>

                {missedError && <div className="attendance-error">{missedError}</div>}
                {missedSuccess && <div className="attendance-success">{missedSuccess}</div>}

                <form className="missed-form" onSubmit={handleMissedSubmit}>
                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="missed-date">Date *</label>
                            <input
                                id="missed-date"
                                type="date"
                                value={missedDate}
                                onChange={(e) => setMissedDate(e.target.value)}
                                max={getYesterdayIST()}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="missed-manager">Approving Manager *</label>
                            <select
                                id="missed-manager"
                                value={missedManagerId}
                                onChange={(e) => setMissedManagerId(e.target.value)}
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
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submittingMissed}
                    >
                        {submittingMissed ? 'Submitting...' : 'Submit Request'}
                    </button>
                </form>

                {/* My Missed Clock-In Requests */}
                {missedRequests.length > 0 && (
                    <div className="missed-requests-section">
                        <h3>My Missed Clock-In Requests</h3>
                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Manager</th>
                                        <th>Status</th>
                                        <th>Comment</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {missedRequests.map((req) => (
                                        <tr key={req.id}>
                                            <td>{format(new Date(req.date + 'T00:00:00'), 'MMM dd, yyyy')}</td>
                                            <td>{req.managerName}</td>
                                            <td>
                                                <span className={`status-badge ${getMissedStatusBadge(req.status)}`}>
                                                    {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                                                </span>
                                            </td>
                                            <td className="reason-cell">{req.managerComment || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Monthly History */}
            <div className="card attendance-history-card">
                <div className="card-header attendance-history-header">
                    <button className="month-nav-btn" onClick={handlePrevMonth}>◀</button>
                    <h2>{monthNames[viewMonth - 1]} {viewYear}</h2>
                    <button className="month-nav-btn" onClick={handleNextMonth}>▶</button>
                </div>

                {loading ? (
                    <div className="loading">Loading...</div>
                ) : monthHistory.length === 0 ? (
                    <div className="empty-state">
                        <h3>No attendance records</h3>
                        <p>No attendance data for this month</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Day</th>
                                    <th>Clock In</th>
                                    <th>Clock Out</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthHistory.map((record) => (
                                    <tr key={record.id}>
                                        <td>{format(new Date(record.date + 'T00:00:00'), 'MMM dd, yyyy')}</td>
                                        <td>{format(new Date(record.date + 'T00:00:00'), 'EEEE')}</td>
                                        <td>
                                            {format(new Date(record.clockInTime), 'hh:mm a')}
                                            {record.isMissedClockIn && <span className="missed-tag">Missed</span>}
                                        </td>
                                        <td>7:00 PM</td>
                                        <td>
                                            <span className={`status-badge ${record.status === 'auto_logged_out' ? 'approved' : 'pending_hr'}`}>
                                                {record.status === 'auto_logged_out' ? 'Logged Out' : 'Working'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="history-summary">
                    <span className="summary-item">
                        <strong>{monthHistory.length}</strong> days attended in {monthNames[viewMonth - 1]}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default MarkAttendance;
