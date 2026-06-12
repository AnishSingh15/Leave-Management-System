import React, { useState, useEffect } from 'react';
import { getAllLeaves } from '../../services/leaveService';
import { getAllUsers } from '../../services/userService';
import { LeaveRequest, User } from '../../types';

const LEFT_COLUMNS = [
  { key: 'casual', label: 'Casual' },
  { key: 'earned', label: 'Earned' },
  { key: 'wfh', label: 'WFH' },
  { key: 'comp_off', label: 'Comp Off' },
  { key: 'menstrual', label: 'Menstrual' },
];

const RIGHT_COLUMNS = [
  { key: 'extra_work', label: 'Extra Work' },
];

const ALL_COLUMNS = [...LEFT_COLUMNS, ...RIGHT_COLUMNS];

const LeaveSummary: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState<
    { user: User; counts: Record<string, number>; total: number }[]
  >([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [allLeaves, allUsers] = await Promise.all([
          getAllLeaves(),
          getAllUsers(),
        ]);

        const activeUsers = allUsers
          .filter((u) => u.isActive)
          .sort((a, b) => a.name.localeCompare(b.name));

        // Filter to approved leaves in the selected year
        const yearLeaves = allLeaves.filter((l: LeaveRequest) => {
          if (l.status !== 'approved') return false;
          const start = new Date(l.startDate);
          return start.getFullYear() === year;
        });

        // Build per-user counts
        const rows = activeUsers.map((user) => {
          const userLeaves = yearLeaves.filter(
            (l) => l.employeeId === user.uid
          );
          const counts: Record<string, number> = {};
          let total = 0;
          ALL_COLUMNS.forEach((col) => {
            const days = userLeaves
              .filter((l) => l.leaveType === col.key)
              .reduce((sum, l) => sum + l.totalDays, 0);
            counts[col.key] = days;
            total += days;
          });
          return { user, counts, total };
        });

        setSummary(rows);
      } catch (err) {
        console.error('Error fetching leave summary:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [year]);

  const currentYear = new Date().getFullYear();

  // Compute column totals
  const colTotals: Record<string, number> = {};
  ALL_COLUMNS.forEach((col) => {
    colTotals[col.key] = summary.reduce((sum, row) => sum + (row.counts[col.key] || 0), 0);
  });
  const grandTotal = summary.reduce((sum, row) => sum + row.total, 0);

  const thStyle: React.CSSProperties = { textAlign: 'center', border: '1px solid #cbd5e1', padding: '10px', fontSize: '0.85rem' };
  const tdStyle: React.CSSProperties = { textAlign: 'center', border: '1px solid #cbd5e1', padding: '10px' };
  const separatorTh: React.CSSProperties = { ...thStyle, borderLeft: '3px solid #94a3b8' };
  const separatorTd: React.CSSProperties = { ...tdStyle, borderLeft: '3px solid #94a3b8' };

  return (
    <div className="attendance-report">
      <div className="page-header">
        <h1>Employee Leave Summary</h1>
        <p>View how many leaves and WFH days each employee has taken</p>
      </div>

      <div className="report-controls">
        <div className="date-picker-group">
          <label htmlFor="summary-year">Year</label>
          <select
            id="summary-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
            }}
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="card report-section">
          <div className="card-header">
            <h2>📊 Leave &amp; WFH Summary — {year}</h2>
          </div>
          {summary.length === 0 ? (
            <div className="empty-state">
              <h3>No employees found</h3>
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #cbd5e1', padding: '10px', textAlign: 'left' }}>Employee</th>
                    {LEFT_COLUMNS.map((col) => (
                      <th key={col.key} style={thStyle}>
                        {col.label}
                      </th>
                    ))}
                    {RIGHT_COLUMNS.map((col) => (
                      <th key={col.key} style={separatorTh}>
                        {col.label}
                      </th>
                    ))}
                    <th style={{ ...separatorTh, background: '#f1f5f9', fontWeight: 700 }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.user.uid}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '10px' }}>
                        <strong>{row.user.name}</strong>
                      </td>
                      {LEFT_COLUMNS.map((col) => (
                        <td key={col.key} style={tdStyle}>
                          {row.counts[col.key] || ''}
                        </td>
                      ))}
                      {RIGHT_COLUMNS.map((col) => (
                        <td key={col.key} style={separatorTd}>
                          {row.counts[col.key] || ''}
                        </td>
                      ))}
                      <td style={{ ...separatorTd, fontWeight: 700, background: '#f8fafc' }}>
                        {row.total || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LeaveSummary;
