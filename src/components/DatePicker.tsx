import { Popover } from "@base-ui/react/popover";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { DayButton, DayPicker, type DayButtonProps } from "react-day-picker";
import { id as indonesianLocale } from "date-fns/locale/id";
import { ModalPopoverContainerContext } from "./Modal";
import { dateLabel, localDate, type DateFormat } from "../domain/ledger";
import { monthLabel } from "../domain/planning";

function toLocalDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return localDate(date) === value ? date : undefined;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function DateDayButton(props: DayButtonProps) {
  const label = new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(
    props.day.date,
  );
  return (
    <DayButton
      {...props}
      aria-label={label}
      aria-pressed={props.modifiers.selected}
      className={`date-picker-day${props.className ? ` ${props.className}` : ""}`}
    >
      {props.day.date.getDate()}
    </DayButton>
  );
}

export type DatePickerProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  dateFormat?: DateFormat;
  placeholder?: string;
};

export function DatePicker({
  id,
  value,
  onChange,
  min = "1900-01-01",
  max = "9999-12-31",
  disabled = false,
  required = false,
  clearable = false,
  dateFormat = "short",
  placeholder = "Pilih tanggal",
}: DatePickerProps) {
  const modalPopoverContainer = useContext(ModalPopoverContainerContext);
  const selectedDate = toLocalDate(value);
  const minDate = toLocalDate(min) ?? new Date(1900, 0, 1, 12);
  const maxDate = toLocalDate(max) ?? new Date(9999, 11, 31, 12);
  const today = localDate();
  const initialDate =
    selectedDate ??
    (today < min
      ? minDate
      : today > max
        ? maxDate
        : (toLocalDate(today) ?? new Date()));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(initialDate));

  useEffect(() => {
    if (!open) setMonth(monthStart(selectedDate ?? initialDate));
  }, [open, value]);

  const selectedLabel = selectedDate
    ? dateLabel(value, dateFormat)
    : placeholder;
  const canChooseToday = today >= min && today <= max;

  function choose(date: Date) {
    const next = localDate(date);
    if (next < min || next > max) return;
    onChange(next);
    setOpen(false);
  }

  function changeMonth(step: number) {
    setMonth((current) => {
      const next = new Date(
        current.getFullYear(),
        current.getMonth() + step,
        1,
        12,
      );
      const key = localDate(next).slice(0, 7);
      if (key < min.slice(0, 7) || key > max.slice(0, 7)) return current;
      return next;
    });
  }

  const monthKey = localDate(month).slice(0, 7);
  const firstMonth = monthStart(minDate);
  const lastMonth = monthStart(maxDate);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        type="button"
        className="date-picker-trigger"
        disabled={disabled}
        aria-required={required || undefined}
      >
        <span className={selectedDate ? "" : "date-picker-placeholder"}>
          {selectedLabel}
        </span>
        <CalendarDays size={16} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal container={modalPopoverContainer}>
        <Popover.Positioner side="bottom" align="start" sideOffset={6}>
          <Popover.Popup
            className="date-picker-popup"
            aria-label="Pilih tanggal"
          >
            <div className="date-picker-toolbar">
              <h3>{monthLabel(monthKey)}</h3>
              <div className="date-picker-nav">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Bulan sebelumnya"
                  disabled={monthKey <= localDate(firstMonth).slice(0, 7)}
                  onClick={() => changeMonth(-1)}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Bulan berikutnya"
                  disabled={monthKey >= localDate(lastMonth).slice(0, 7)}
                  onClick={() => changeMonth(1)}
                >
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <DayPicker
              aria-label={`Pilih tanggal, ${monthLabel(monthKey)}`}
              mode="single"
              month={month}
              onMonthChange={(nextMonth) => setMonth(monthStart(nextMonth))}
              startMonth={firstMonth}
              endMonth={lastMonth}
              selected={selectedDate}
              onSelect={(date) => date && choose(date)}
              disabled={(date) => {
                const key = localDate(date);
                return key < min || key > max;
              }}
              locale={indonesianLocale}
              weekStartsOn={1}
              fixedWeeks
              showOutsideDays
              hideNavigation
              className="ranledger-day-picker date-picker-calendar"
              components={{ DayButton: DateDayButton }}
            />
            <div className="date-picker-footer">
              {clearable ? (
                <button
                  type="button"
                  className="text-link"
                  disabled={!value}
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  Hapus
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="text-link"
                disabled={!canChooseToday}
                onClick={() => {
                  const date = toLocalDate(today);
                  if (date) choose(date);
                }}
              >
                Hari ini
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function MonthPicker({
  id,
  value,
  onChange,
  min = "1900-01",
  max = "9999-12",
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
}) {
  const modalPopoverContainer = useContext(ModalPopoverContainerContext);
  const [open, setOpen] = useState(false);
  const selectedYear = Number(value.slice(0, 4));
  const [year, setYear] = useState(selectedYear || new Date().getFullYear());
  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(max.slice(0, 4));
  const selectedMonth = Number(value.slice(5, 7)) - 1;
  const months = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat("id-ID", { month: "long" }).format(
      new Date(year, index, 1, 12),
    ),
  );

  useEffect(() => {
    if (!open && selectedYear) setYear(selectedYear);
  }, [open, value]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        type="button"
        className="date-picker-trigger month-picker-trigger"
        disabled={disabled}
        aria-label={`Pilih bulan, ${monthLabel(value)}`}
      >
        <span>{value ? monthLabel(value) : "Pilih bulan"}</span>
        <CalendarDays size={16} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal container={modalPopoverContainer}>
        <Popover.Positioner side="bottom" align="start" sideOffset={6}>
          <Popover.Popup
            className="date-picker-popup month-picker-popup"
            aria-label="Pilih bulan"
          >
            <div className="date-picker-toolbar">
              <h3>{year}</h3>
              <div className="date-picker-nav">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Tahun sebelumnya"
                  disabled={year <= minYear}
                  onClick={() =>
                    setYear((current) => Math.max(minYear, current - 1))
                  }
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Tahun berikutnya"
                  disabled={year >= maxYear}
                  onClick={() =>
                    setYear((current) => Math.min(maxYear, current + 1))
                  }
                >
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="month-picker-grid">
              {months.map((label, index) => {
                const monthValue = `${year}-${String(index + 1).padStart(2, "0")}`;
                const isDisabled = monthValue < min || monthValue > max;
                const isSelected =
                  year === selectedYear && index === selectedMonth;
                return (
                  <button
                    key={monthValue}
                    type="button"
                    className={`month-picker-option${isSelected ? " is-selected" : ""}`}
                    disabled={isDisabled}
                    aria-pressed={isSelected}
                    onClick={() => {
                      onChange(monthValue);
                      setOpen(false);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
