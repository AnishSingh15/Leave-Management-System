import React, { useState, useEffect } from 'react';
import { getAttendanceByDate } from '../../services/attendanceService';
import { getAllLeaves } from '../../services/leaveService';
import { getAllUsers } from '../../services/userService';
import { AttendanceRecord, User } from '../../types';
import { format, addDays, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import './AttendanceReport.css';

const AttendanceReport: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [downloadFromDate, setDownloadFromDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [downloadToDate, setDownloadToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [downloadFormat, setDownloadFormat] = useState<'xlsx' | 'csv'>('xlsx');
    const [downloading, setDownloading] = useState(false);

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

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const from = parseISO(downloadFromDate);
            const to = parseISO(downloadToDate);
            if (from > to) {
                alert('"From" date must be before or equal to "To" date.');
                setDownloading(false);
                return;
            }

            // Fetch users and leaves
            const usersData = await getAllUsers();
            const activeUsers = usersData.filter(u => u.isActive).sort((a, b) => a.name.localeCompare(b.name));
            const allLeaves = await getAllLeaves();

            // Build list of dates
            const dateList: Date[] = [];
            let d = from;
            while (d <= to) {
                dateList.push(d);
                d = addDays(d, 1);
            }

            // Fetch attendance for each date
            const attendanceByDate: Map<string, Set<string>> = new Map();
            for (const date of dateList) {
                const dateStr = format(date, 'yyyy-MM-dd');
                const dayRecords = await getAttendanceByDate(dateStr);
                attendanceByDate.set(dateStr, new Set(dayRecords.map(r => r.employeeId)));
            }

            // Build a lookup: employeeId -> date -> leaveType (for approved leaves)
            const leaveMap = new Map<string, Map<string, string>>();
            const leaveTypes: Record<string, string> = {
                casual: 'Casual Leave', wfh: 'WFH', extra_work: 'Extra Work',
                menstrual: 'Menstrual Leave', bereavement: 'Bereavement Leave', paid: 'Paid Leave', sick: 'Sick Leave', comp_off: 'Comp Off'
            };
            allLeaves.filter(l => l.status === 'approved').forEach(leave => {
                if (!leaveMap.has(leave.employeeId)) {
                    leaveMap.set(leave.employeeId, new Map());
                }
                const empMap = leaveMap.get(leave.employeeId)!;
                // Mark each date in the leave range
                let ld = new Date(leave.startDate);
                const le = new Date(leave.endDate);
                while (ld <= le) {
                    empMap.set(format(ld, 'yyyy-MM-dd'), leaveTypes[leave.leaveType] || leave.leaveType);
                    ld = addDays(ld, 1);
                }
            });

            // Build header row: Employee | Email | date1 | date2 | ...
            const headers = ['Employee', 'Email', ...dateList.map(dt => format(dt, 'dd-MMM'))];

            // Build data rows: one row per employee
            const dataRows: string[][] = [];
            activeUsers.forEach(user => {
                const row: string[] = [user.name, user.email];
                dateList.forEach(dt => {
                    const dateStr = format(dt, 'yyyy-MM-dd');
                    const presentSet = attendanceByDate.get(dateStr);
                    const isPresent = presentSet?.has(user.uid);
                    const leaveType = leaveMap.get(user.uid)?.get(dateStr);

                    if (isPresent) {
                        row.push('Present');
                    } else if (leaveType) {
                        row.push(leaveType);
                    } else {
                        row.push('Absent');
                    }
                });
                dataRows.push(row);
            });

            // Create workbook
            const sheetData = [headers, ...dataRows];
            const ws = XLSX.utils.aoa_to_sheet(sheetData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

            const filename = `attendance_${downloadFromDate}_to_${downloadToDate}.${downloadFormat}`;
            XLSX.writeFile(wb, filename, { bookType: downloadFormat });
        } catch (err) {
            console.error('Download error:', err);
            alert('Failed to generate report. Please try again.');
        } finally {
            setDownloading(false);
        }
    };

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

            {/* Download Section */}
            <div className="report-download" style={{ marginTop: '1.5rem', padding: '1rem', background: '#f1f5f9', borderRadius: '8px', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>From</label>
                    <input
                        type="date"
                        value={downloadFromDate}
                        onChange={(e) => setDownloadFromDate(e.target.value)}
                        max={format(new Date(), 'yyyy-MM-dd')}
                        style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>To</label>
                    <input
                        type="date"
                        value={downloadToDate}
                        onChange={(e) => setDownloadToDate(e.target.value)}
                        max={format(new Date(), 'yyyy-MM-dd')}
                        style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Format</label>
                    <select
                        value={downloadFormat}
                        onChange={(e) => setDownloadFormat(e.target.value as 'xlsx' | 'csv')}
                        style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    >
                        <option value="xlsx">Excel (.xlsx)</option>
                        <option value="csv">CSV (.csv)</option>
                    </select>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleDownload}
                    disabled={downloading}
                    style={{ padding: '0.5rem 1.5rem', fontWeight: 'bold' }}
                >
                    {downloading ? 'Generating...' : '⬇ Download Report'}
                </button>
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
                                                <td>
                                                    <span className="status-badge approved">Present</span>
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
