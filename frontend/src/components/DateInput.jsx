import { useEffect, useRef, useState } from "react";
import {
  BS_MONTHS,
  adToBsSafe,
  bsToAdSafe,
  getDaysInBsMonth,
  isoToSlashDisplay,
  todayAdIso,
} from "../utils/bsDate";

const DateInput = ({ id, label, value, onChange, mode, onModeChange }) => {
  const isControlled = mode !== undefined;
  const [internalMode, setInternalMode] = useState("BS");
  const activeMode = isControlled ? mode : internalMode;

  const setMode = (next) => {
    if (isControlled) {
      onModeChange && onModeChange(next);
    } else {
      setInternalMode(next);
    }
  };

  const [calendarOpen, setCalendarOpen] = useState(false);
  const wrapperRef = useRef(null);

  const todayIso = todayAdIso();
  const todayBs = adToBsSafe(todayIso);
  const [todayBsY, todayBsM, todayBsD] = todayBs
    ? todayBs.split("-").map(Number)
    : [2082, 1, 1];

  const currentBs = value ? adToBsSafe(value) : null;

  const [viewYear, setViewYear] = useState(() => {
    if (currentBs) return Number(currentBs.split("-")[0]);
    return todayBsY;
  });
  const [viewMonth, setViewMonth] = useState(() => {
    if (currentBs) return Number(currentBs.split("-")[1]);
    return todayBsM;
  });

  useEffect(() => {
    if (calendarOpen && currentBs) {
      const [y, m] = currentBs.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isFutureBs = (y, m, d) => {
    if (y !== todayBsY) return y > todayBsY;
    if (m !== todayBsM) return m > todayBsM;
    return d > todayBsD;
  };

  const viewIsCurrentOrFutureMonth =
    viewYear > todayBsY || (viewYear === todayBsY && viewMonth >= todayBsM);

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewIsCurrentOrFutureMonth) return;
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const daysInMonth = getDaysInBsMonth(viewYear, viewMonth);
  const firstDayAd = bsToAdSafe(
    `${viewYear}-${String(viewMonth).padStart(2, "0")}-01`,
  );
  const startWeekday = firstDayAd
    ? new Date(firstDayAd + "T00:00:00").getDay()
    : 0;

  const handleDayClick = (day) => {
    if (isFutureBs(viewYear, viewMonth, day)) return;
    const bsIso = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const adIso = bsToAdSafe(bsIso);
    if (adIso) {
      onChange(adIso);
      setCalendarOpen(false);
    }
  };

  return (
    <div className="date-input-wrapper" ref={wrapperRef}>
      {label && <label className="date-input-label">{label}</label>}

      <div className="date-input-row">
        <div className="date-input-toggle">
          <button
            type="button"
            className={
              activeMode === "BS"
                ? "date-toggle-btn active"
                : "date-toggle-btn"
            }
            onClick={() => setMode("BS")}
          >
            BS
          </button>
          <button
            type="button"
            className={
              activeMode === "AD"
                ? "date-toggle-btn active"
                : "date-toggle-btn"
            }
            onClick={() => setMode("AD")}
          >
            AD
          </button>
        </div>

        {activeMode === "AD" ? (
          <div className="date-input-field">
            <input
              id={id}
              type="date"
              value={value || ""}
              max={todayIso}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        ) : (
          <div className="date-input-field bs-date-picker">
            <input
              id={id}
              type="text"
              readOnly
              placeholder="mm/dd/yyyy"
              value={currentBs ? isoToSlashDisplay(currentBs) : ""}
              onFocus={() => setCalendarOpen(true)}
              onClick={() => setCalendarOpen(true)}
            />
            <button
              type="button"
              className="date-calendar-icon-btn"
              aria-label="Open calendar"
              onClick={() => setCalendarOpen((open) => !open)}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>

            {calendarOpen && (
              <div className="bs-calendar-panel">
                <div className="bs-calendar-header">
                  <button type="button" onClick={goPrevMonth}>
                    &lt;
                  </button>
                  <span>
                    {BS_MONTHS[viewMonth - 1]} {viewYear}
                  </span>
                  <button
                    type="button"
                    onClick={goNextMonth}
                    disabled={viewIsCurrentOrFutureMonth}
                  >
                    &gt;
                  </button>
                </div>
                <div className="bs-calendar-grid">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div key={d} className="bs-calendar-day-label">
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: startWeekday }).map((_, i) => (
                    <div key={`blank-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
                    (day) => {
                      const future = isFutureBs(viewYear, viewMonth, day);
                      const isToday =
                        viewYear === todayBsY &&
                        viewMonth === todayBsM &&
                        day === todayBsD;
                      return (
                        <button
                          key={day}
                          type="button"
                          disabled={future}
                          className={`bs-calendar-cell${isToday ? " today" : ""}`}
                          onClick={() => handleDayClick(day)}
                        >
                          {day}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DateInput;
