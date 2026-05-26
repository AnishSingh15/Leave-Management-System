import React, { useState, useMemo, useEffect } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  format,
  isSameMonth,
  isWeekend,
  isToday,
  isBefore,
  startOfDay
} from 'date-fns';
import { getUserAttendanceHistory } from '../../services/attendanceService';
import { AttendanceRecord } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import './LeaveCalendar.css';

// National holidays — update this list as needed
// Format: { date: 'YYYY-MM-DD', name: 'Holiday Name' }
export const NATIONAL_HOLIDAYS: { date: string; name: string }[] = [
  { date: '2026-01-01', name: 'New Year' },
  { date: '2026-01-15', name: 'Makara Sankranti' },
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-03-04', name: 'Holi' },
  { date: '2026-03-19', name: 'Ugadi' },
  { date: '2026-03-26', name: 'Ram Navami' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-05-28', name: 'Bakrid' },
  { date: '2026-06-26', name: 'Last day of Muharram' },
  { date: '2026-08-26', name: 'Eid-Milad' },
  { date: '2026-09-14', name: 'Ganesh Chaturthi' },
  { date: '2026-10-02', name: 'Gandhi Jayanthi' },
  { date: '2026-10-20', name: 'Ayudha Pooja' },
  { date: '2026-10-21', name: 'Vijayadashami' },
  { date: '2026-11-09', name: 'Deepavali' },
  { date: '2026-11-10', name: 'Deepavali' },
  { date: '2026-12-24', name: 'Christmas Eve' },
  { date: '2026-12-25', name: 'Christmas' },
];

interface LeaveCalendarProps {
  compact?: boolean; // smaller version for forms
}

const LeaveCalendar: React.FC<LeaveCalendarProps> = ({ compact = false }) => {
  const { userData } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [attendanceMap, setAttendanceMap] = useState<Map<string, AttendanceRecord>>(new Map());
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    NATIONAL_HOLIDAYS.forEach(h => map.set(h.date, h.name));
    return map;
  }, []);

  // Fetch attendance for current month whenever month or user changes
  useEffect(() => {
    if (!userData?.uid) return;

    const fetchAttendance = async () => {
      setLoadingAttendance(true);
      try {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth() + 1; // 1-indexed
        const records = await getUserAttendanceHistory(userData.uid, year, month);
        const map = new Map<string, AttendanceRecord>();
        records.forEach(r => map.set(r.date, r));
        setAttendanceMap(map);
      } catch (err) {
        console.error('Error fetching attendance for calendar:', err);
      } finally {
        setLoadingAttendance(false);
      }
    };

    fetchAttendance();
  }, [userData?.uid, currentMonth]);

  const renderHeader = () => (
    <div className="cal-header">
      <button className="cal-nav-btn" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
        ‹
      </button>
      <h3 className="cal-month-title">
        {format(currentMonth, 'MMMM yyyy')}
        {loadingAttendance && <span className="cal-loading-dot" title="Loading attendance…"> ●</span>}
      </h3>
      <button className="cal-nav-btn" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
        ›
      </button>
    </div>
  );

  const renderDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className="cal-days-row">
        {days.map(day => (
          <div key={day} className={`cal-day-label ${day === 'Sat' || day === 'Sun' ? 'weekend-label' : ''}`}>
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    const todayStart = startOfDay(new Date());

    const rows: React.ReactNode[] = [];
    let days: React.ReactNode[] = [];
    let day = calStart;

    while (day <= calEnd) {
      for (let i = 0; i < 7; i++) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const inMonth = isSameMonth(day, monthStart);
        const holiday = holidayMap.get(dateStr);
        const weekend = isWeekend(day);
        const today = isToday(day);
        const isPastDay = isBefore(startOfDay(day), todayStart);

        // Attendance status for this day
        const attendanceRecord = inMonth ? attendanceMap.get(dateStr) : undefined;
        const isPresent = !!attendanceRecord;
        // Absent = past weekday in this month, not a holiday, not a weekend, and no attendance record
        const isAbsent = inMonth && isPastDay && !today && !weekend && !holiday && !isPresent;

        let cellClass = 'cal-cell';
        if (!inMonth) cellClass += ' cal-outside';
        if (weekend && inMonth) cellClass += ' cal-weekend';
        if (holiday && inMonth) cellClass += ' cal-holiday';
        if (today) cellClass += ' cal-today';
        if (isPresent && inMonth) cellClass += ' cal-present';
        if (isAbsent) cellClass += ' cal-absent';

        let tooltipText = '';
        if (holiday && inMonth) tooltipText = holiday;
        else if (weekend && inMonth) tooltipText = 'Weekend';
        if (isPresent && inMonth) tooltipText = tooltipText ? `${tooltipText} · Present` : 'Present';
        else if (isAbsent) tooltipText = tooltipText ? `${tooltipText} · Absent` : 'Absent';

        days.push(
          <div key={dateStr} className={cellClass} title={tooltipText}>
            <span className="cal-date-num">{format(day, 'd')}</span>
            {holiday && inMonth && !compact && (
              <span className="cal-holiday-name">{holiday}</span>
            )}
            {holiday && inMonth && compact && (
              <span className="cal-holiday-dot" title={holiday}>•</span>
            )}
            {/* Attendance indicator dot */}
            {inMonth && !weekend && !holiday && isPastDay && !today && (
              <span className={`cal-attend-dot ${isPresent ? 'present' : 'absent'}`} />
            )}
          </div>
        );

        day = addDays(day, 1);
      }

      rows.push(
        <div className="cal-row" key={format(day, 'yyyy-MM-dd')}>
          {days}
        </div>
      );
      days = [];
    }

    return <div className="cal-body">{rows}</div>;
  };

  return (
    <div className={`leave-calendar ${compact ? 'compact' : ''}`}>
      {renderHeader()}
      {renderDays()}
      {renderCells()}
      <div className="cal-legend">
        <span className="cal-legend-item">
          <span className="cal-legend-dot weekend-dot"></span> Weekend
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-dot holiday-dot"></span> Holiday
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-dot today-dot"></span> Today
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-dot present-dot"></span> Present
        </span>
        <span className="cal-legend-item">
          <span className="cal-legend-dot absent-dot"></span> Absent
        </span>
      </div>
    </div>
  );
};

export default LeaveCalendar;
