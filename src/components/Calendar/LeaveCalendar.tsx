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
  // 2026 Indian National Holidays (placeholder — user will provide real list)
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-03-10', name: 'Maha Shivaratri' },
  { date: '2026-03-17', name: 'Holi' },
  { date: '2026-03-31', name: 'Id-ul-Fitr' },
  { date: '2026-04-02', name: 'Ram Navami' },
  { date: '2026-04-14', name: 'Dr. Ambedkar Jayanti' },
  { date: '2026-04-18', name: 'Good Friday' },
  { date: '2026-05-01', name: 'May Day' },
  { date: '2026-05-25', name: 'Buddha Purnima' },
  { date: '2026-06-07', name: 'Id-ul-Adha (Bakrid)' },
  { date: '2026-07-06', name: 'Muharram' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-08-16', name: 'Janmashtami' },
  { date: '2026-09-04', name: 'Milad-un-Nabi' },
  { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti' },
  { date: '2026-10-20', name: 'Dussehra' },
  { date: '2026-11-08', name: 'Diwali' },
  { date: '2026-11-09', name: 'Diwali (Day 2)' },
  { date: '2026-11-19', name: 'Guru Nanak Jayanti' },
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
