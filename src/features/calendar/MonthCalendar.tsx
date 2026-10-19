import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { monthLabel } from "../../domain/planning";
import { dateLabel, localDate } from "../../domain/ledger";
import type { CalendarItem } from "../../domain/forecast";
export function MonthCalendar({
  items,
  start,
  end,
  selected,
  onSelect,
}: {
  items: CalendarItem[];
  start: string;
  end: string;
  selected: string;
  onSelect: (day: string) => void;
}) {
  const [month, setMonth] = useState(start.slice(0, 7));
  const safeMonth =
      month >= start.slice(0, 7) && month <= end.slice(0, 7)
        ? month
        : start.slice(0, 7),
    [year, number] = safeMonth.split("-").map(Number),
    offset = (new Date(year, number - 1, 1).getDay() + 6) % 7,
    last = new Date(year, number, 0).getDate();
  const days = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const rows = map.get(item.date) ?? [];
      rows.push(item);
      map.set(item.date, rows);
    }
    return map;
  }, [items]);
  const change = (step: number) => {
    const date = localDate(new Date(year, number - 1 + step, 1, 12)).slice(
      0,
      7,
    );
    if (date >= start.slice(0, 7) && date <= end.slice(0, 7)) setMonth(date);
  };
  return (
    <div className="month-calendar">
      <div className="calendar-toolbar">
        <h3>{monthLabel(safeMonth)}</h3>
        <div className="v3-actions">
          <button
            className="icon-button"
            aria-label="Bulan sebelumnya"
            disabled={safeMonth <= start.slice(0, 7)}
            onClick={() => change(-1)}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            aria-label="Bulan berikutnya"
            disabled={safeMonth >= end.slice(0, 7)}
            onClick={() => change(1)}
          >
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <table>
        <caption className="sr-only">Agenda {monthLabel(safeMonth)}</caption>
        <thead>
          <tr>
            {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((day) => (
              <th key={day} scope="col">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.ceil((offset + last) / 7) }, (_, week) => (
            <tr key={week}>
              {Array.from({ length: 7 }, (_, weekday) => {
                const day = week * 7 + weekday - offset + 1;
                if (day < 1 || day > last) return <td key={weekday} />;
                const date = `${safeMonth}-${String(day).padStart(2, "0")}`,
                  events = days.get(date) ?? [];
                return (
                  <td key={weekday}>
                    <button
                      aria-label={`${dateLabel(date)} · ${events.length} agenda`}
                      aria-pressed={selected === date}
                      disabled={date < start || date > end}
                      onClick={() => onSelect(selected === date ? "" : date)}
                      className={date === start ? "calendar-today" : ""}
                    >
                      <span>{day}</span>
                      {events.length > 0 && (
                        <>
                          <small>{events.length} agenda</small>
                          <span className="calendar-dots" aria-hidden="true">
                            {events.slice(0, 4).map((event, i) => (
                              <i
                                key={i}
                                className={
                                  event.kind === "income"
                                    ? "income-dot"
                                    : "expense-dot"
                                }
                              />
                            ))}
                          </span>
                        </>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
