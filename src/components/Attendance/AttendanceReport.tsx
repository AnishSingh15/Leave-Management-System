import React, { useState, useEffect } from 'react';
import { getAttendanceByDate } from '../../services/attendanceService';
import { getAllUsers } from '../../services/userService';
import { AttendanceRecord, User } from '../../types';
import { format } from 'date-fns';
import './AttendanceReport.css';

const AttendanceReport: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [attendanceData, usersData] = await Promise.all([
                    getAttendanceByDate(selectedDate),
                    getAllUsers(),
                ]);
                setRecords(attendanceData);
                setAllUsers(usersData.filter(u => u.isActive));
            } catch (err) {
                console.error('Error fetching attendance report:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedDate]);

    const presentUserIds = new Set(records.map(r => r.employeeId));

    // Only show absent list for past dates (after office hours ended)
    // For today or future dates, we can't mark people absent yet
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const isPastDate = selectedDate < todayStr;
    const absentUsers = isPastDate
        ? allUsers.filter(u => !presentUserIds.has(u.uid))
        : [];
    const presentCount = records.length;
    const absentCount = absentUsers.length;

    return (
        <div className="attendance-report">
            <div className="page-header">
                <h1>Attendance Report</h1>
                <p>View date-wise attendance of all employees</p>
            </div>

            {/* Date Picker & Stats */}
            <div className="report-controls">
                <div className="date-picker-group">
                    <label htmlFor="report-date">Select Date</label>
                    <input
                        id="report-date"
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        max={format(new Date(), 'yyyy-MM-dd')}
                    />
                </div>

                <div className="report-stats">
                    <div className="report-stat present">
                        <div className="report-stat-value">{presentCount}</div>
                        <div className="report-stat-label">Present</div>
                    </div>
                    <div className="report-stat absent">
                        <div className="report-stat-value">{absentCount}</div>
                        <div className="report-stat-label">Absent</div>
                    </div>
                    <div className="report-stat total">
                        <div className="report-stat-value">{allUsers.length}</div>
                        <div className="report-stat-label">Total</div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="loading">Loading...</div>
            ) : (
                <>
                    {/* Present Employees */}
                    <div className="card report-section">
                        <div className="card-header">
                            <h2>✅ Present ({presentCount})</h2>
                        </div>
                        {records.length === 0 ? (
                            <div className="empty-state">
                                <h3>No attendance records</h3>
                                <p>No one has clocked in on {format(new Date(selectedDate + 'T00:00:00'), 'MMMM d, yyyy')}</p>
                            </div>
                        ) : (
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Employee</th>
                                            <th>Clock In Time</th>
                                            <th>Clock Out Time</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {records.map((record) => (
                                            <tr key={record.id}>
                                                <td>
                                                    <strong>{record.employeeName}</strong>
                                                    {record.isMissedClockIn && <span className="missed-tag">Missed</span>}
                                                </td>
                                                <td>{format(new Date(record.clockInTime), 'hh:mm a')}</td>
                                                <td>{format(new Date(record.clockOutTime), 'hh:mm a')}</td>
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
                    </div>

                    {/* Absent Employees */}
                    <div className="card report-section absent-section">
                        <div className="card-header">
                            <h2>❌ Absent ({absentCount})</h2>
                        </div>
                        {!isPastDate ? (
                            <div className="empty-state">
                                <h3>Today / Future date</h3>
                                <p>Absent list is only available for past dates after office hours</p>
                            </div>
                        ) : absentUsers.length === 0 ? (
                            <div className="empty-state">
                                <h3>Everyone is present!</h3>
                                <p>All active employees have clocked in</p>
                            </div>
                        ) : (
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Employee</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {absentUsers.map((user) => (
                                            <tr key={user.uid} className="absent-row">
                                                <td><strong>{user.name}</strong></td>
                                                <td>{user.email}</td>
                                                <td>
                                                    <span className={`role-badge ${user.role}`}>
                                                        {user.role.replace('_', ' ').toUpperCase()}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="status-badge rejected">Absent</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default AttendanceReport;
