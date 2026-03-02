import React, { useState, useMemo } from 'react';
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
  isToday
} from 'date-fns';
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
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    NATIONAL_HOLIDAYS.forEach(h => map.set(h.date, h.name));
    return map;
  }, []);

  const renderHeader = () => (
    <div className="cal-header">
      <button className="cal-nav-btn" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
        ‹
      </button>
      <h3 className="cal-month-title">
        {format(currentMonth, 'MMMM yyyy')}
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

        let cellClass = 'cal-cell';
        if (!inMonth) cellClass += ' cal-outside';
        if (weekend && inMonth) cellClass += ' cal-weekend';
        if (holiday && inMonth) cellClass += ' cal-holiday';
        if (today) cellClass += ' cal-today';

        days.push(
          <div key={dateStr} className={cellClass} title={holiday || (weekend && inMonth ? 'Weekend' : '')}>
            <span className="cal-date-num">{format(day, 'd')}</span>
            {holiday && inMonth && !compact && (
              <span className="cal-holiday-name">{holiday}</span>
            )}
            {holiday && inMonth && compact && (
              <span className="cal-holiday-dot" title={holiday}>•</span>
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
      </div>
    </div>
  );
};

export default LeaveCalendar;
