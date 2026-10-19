import { useId, useLayoutEffect, useRef } from "react";
import { NavLink } from "react-router";
import { SelectField } from "./SelectField";
import { useLedger } from "./LedgerProvider";
import { isLiability } from "../domain/finance";

export function AmountField({
  label = "Nominal (Rp)",
  value,
  onChange,
  negative = false,
  disabled = false,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  negative?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null) {
      ref.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [value]);
  function update(digits: string, count: number, sign: string) {
    const formatted = sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    let position = sign.length,
      seen = 0;
    while (position < formatted.length && seen < count) {
      if (/\d/.test(formatted[position])) seen++;
      position++;
    }
    while (formatted[position] === ".") position++;
    caret.current = position;
    onChange(formatted);
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={ref}
        value={value}
        placeholder="Misalnya, 250.000"
        inputMode={negative ? "text" : "numeric"}
        maxLength={24}
        autoComplete="off"
        disabled={disabled}
        onChange={(e) => {
          const input = e.target.value;
          // Preserve invalid pasted/decimal text so validation can explain it instead of changing its value.
          const native = e.nativeEvent as InputEvent;
          if (
            !/^-?[\d.]*$/.test(input) ||
            (!negative && input.startsWith("-")) ||
            ((native.inputType === "insertFromPaste" || native.data === ".") &&
              input.includes(".") &&
              !/^-?\d{1,3}(?:\.\d{3})+$/.test(input))
          ) {
            onChange(input);
            return;
          }
          const sign = negative && input.startsWith("-") ? "-" : "";
          const before = input
            .slice(0, e.target.selectionStart ?? input.length)
            .replace(/\D/g, "").length;
          update(input.replace(/\D/g, ""), before, sign);
        }}
        onKeyDown={(e) => {
          const start = e.currentTarget.selectionStart ?? 0;
          if (
            start !== e.currentTarget.selectionEnd ||
            !/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(value)
          )
            return;
          const digits = value.replace(/\D/g, "");
          const count = value.slice(0, start).replace(/\D/g, "").length;
          const sign = value.startsWith("-") ? "-" : "";
          if (e.key === "Backspace" && value[start - 1] === ".") {
            e.preventDefault();
            update(
              digits.slice(0, count - 1) + digits.slice(count),
              count - 1,
              sign,
            );
          } else if (e.key === "Delete" && value[start] === ".") {
            e.preventDefault();
            update(
              digits.slice(0, count) + digits.slice(count + 1),
              count,
              sign,
            );
          }
        }}
      />
    </div>
  );
}
export function WalletPicker({
  value,
  onChange,
  all = false,
  archivedId,
  label = "Dompet",
  id,
  disabled,
  assetOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  all?: boolean;
  archivedId?: string;
  label?: string;
  id?: string;
  disabled?: boolean;
  assetOnly?: boolean;
}) {
  const ledger = useLedger();
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={controlId}>{label}</label>
      <SelectField
        id={controlId}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        options={[
          ...(all ? [{ value: "", label: "Semua dompet" }] : []),
          ...ledger.wallets
            .filter(
              (w) =>
                (!assetOnly || !isLiability(w)) &&
                (all || !w.archived || w.id === archivedId),
            )
            .map((w) => ({
              value: w.id,
              label: w.name + (w.archived ? " (arsip)" : ""),
            })),
        ]}
      />
    </div>
  );
}
export function ProgressMeter({
  value,
  label,
  warning = false,
  hidden = false,
}: {
  value: number;
  label: string;
  warning?: boolean;
  hidden?: boolean;
}) {
  return (
    <div
      className={`progress-meter ${warning ? "warning" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={
        hidden ? undefined : Math.round(Math.min(100, Math.max(0, value * 100)))
      }
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={
        hidden ? "Nominal disembunyikan" : `${Math.round(value * 100)}%`
      }
    >
      <span
        style={{
          width: hidden ? "0%" : `${Math.min(100, Math.max(0, value * 100))}%`,
        }}
      />
    </div>
  );
}
export function PlanningTabs() {
  return (
    <nav className="planning-tabs" aria-label="Perencanaan">
      <NavLink to="/rencana" end>
        Transaksi rutin
      </NavLink>
      <NavLink to="/rencana/tujuan">Target tabungan</NavLink>
      <NavLink to="/kalender">Kalender & proyeksi</NavLink>
    </nav>
  );
}
