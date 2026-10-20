import { createContext, useContext, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DayButton, DayPicker, type DayButtonProps } from "react-day-picker";
import { id } from "date-fns/locale/id";
import { monthLabel } from "../../domain/planning";
import { localDate } from "../../domain/ledger";
import type { CalendarItem } from "../../domain/forecast";

const agendaByDateContext = createContext<Map<string, CalendarItem[]>>(
  new Map(),
);

function fromLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function CalendarDayButton(props: DayButtonProps) {
  const agendaByDate = useContext(agendaByDateContext);
  const date = localDate(props.day.date);
  const agenda = agendaByDate.get(date) ?? [];
  const accessibleDate = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
  }).format(props.day.date);

  return (
    <DayButton
      {...props}
      aria-label={`${accessibleDate} · ${agenda.length} agenda`}
      aria-pressed={props.modifiers.selected}
      className={`month-calendar-day${props.className ? ` ${props.className}` : ""}`}
    >
      <span className="month-calendar-day-number">
        {props.day.date.getDate()}
      </span>
      {agenda.length > 0 && (
        <>
          <small aria-hidden="true">{agenda.length} agenda</small>
          <span className="calendar-dots" aria-hidden="true">
            {agenda.slice(0, 4).map((item, index) => (
              <i
                key={`${item.id}-${index}`}
                className={
                  item.kind === "income" ? "income-dot" : "expense-dot"
                }
              />
            ))}
          </span>
        </>
      )}
    </DayButton>
  );
}

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
  const firstMonth = start.slice(0, 7);
  const lastMonth = end.slice(0, 7);
  const [month, setMonth] = useState(firstMonth);
  const safeMonth =
    month >= firstMonth && month <= lastMonth ? month : firstMonth;
  const monthDate = fromLocalDate(`${safeMonth}-01`);
  const agendaByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const agenda = map.get(item.date) ?? [];
      agenda.push(item);
      map.set(item.date, agenda);
    }
    return map;
  }, [items]);

  const changeMonth = (step: number) => {
    const next = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + step,
      1,
      12,
    );
    const nextMonth = localDate(next).slice(0, 7);
    if (nextMonth >= firstMonth && nextMonth <= lastMonth) setMonth(nextMonth);
  };

  return (
    <section className="month-calendar" aria-label="Kalender bulanan">
      <div className="calendar-toolbar">
        <h3>{monthLabel(safeMonth)}</h3>
        <div className="v3-actions">
          <button
            className="icon-button"
            aria-label="Bulan sebelumnya"
            disabled={safeMonth <= firstMonth}
            onClick={() => changeMonth(-1)}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            aria-label="Bulan berikutnya"
            disabled={safeMonth >= lastMonth}
            onClick={() => changeMonth(1)}
          >
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <agendaByDateContext.Provider value={agendaByDate}>
        <DayPicker
          aria-label={`Agenda ${monthLabel(safeMonth)}`}
          mode="single"
          month={monthDate}
          onMonthChange={(date) => setMonth(localDate(date).slice(0, 7))}
          startMonth={fromLocalDate(`${firstMonth}-01`)}
          endMonth={fromLocalDate(`${lastMonth}-01`)}
          selected={selected ? fromLocalDate(selected) : undefined}
          onSelect={(date) => onSelect(date ? localDate(date) : "")}
          disabled={(date) => {
            const day = localDate(date);
            return day < start || day > end;
          }}
          locale={id}
          weekStartsOn={1}
          fixedWeeks
          showOutsideDays={false}
          hideNavigation
          className="ranledger-day-picker"
          components={{ DayButton: CalendarDayButton }}
        />
      </agendaByDateContext.Provider>
    </section>
  );
}
