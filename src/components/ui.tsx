import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";
import { SelectField } from "./SelectField";
import type {
  Category,
  DateRange,
  Ledger,
  Period,
  Transaction,
} from "../domain/ledger";
import {
  dateLabel,
  dateRange,
  localDate,
  money,
  validDate,
} from "../domain/ledger";
import { useSearchParams } from "react-router";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M7 6h11a7 7 0 0 1 0 14H7V6Z"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d="m16 20 9 7M7 13h10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <span>
          ranledger<span className="logo-period"></span>
        </span>
      )}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}
export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="notice notice-error" role="alert">
      {children}
    </div>
  );
}
export function EmptyState({
  filtered = false,
  onAdd,
  onClear,
  title,
  description,
}: {
  filtered?: boolean;
  onAdd?: () => void;
  onClear?: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <svg
        className="empty-art"
        viewBox="0 0 160 110"
        fill="none"
        aria-hidden="true"
      >
        <path d="M23 86h114" stroke="var(--line)" />
        <rect
          x="47"
          y="15"
          width="70"
          height="78"
          rx="5"
          fill="var(--surface)"
          stroke="var(--line)"
          transform="rotate(8 47 15)"
        />
        <rect
          x="39"
          y="11"
          width="70"
          height="78"
          rx="5"
          fill="var(--surface)"
          stroke="var(--brand)"
          strokeWidth="1.5"
        />
        <path
          d="M51 31h45M51 43h24M51 56h45M51 68h29"
          stroke="var(--line)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="111" cy="75" r="16" fill="var(--brand)" />
        <path
          d="M105 75h12m-6-6v12"
          stroke="var(--on-brand)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <h3>
        {title ??
          (filtered
            ? "Belum ada catatan yang cocok"
            : "Mulai dari satu catatan")}
      </h3>
      <p>
        {description ??
          (filtered
            ? "Coba periode lain atau sederhanakan pencarianmu."
            : "Makan siang, bensin, atau pemasukan hari ini. Catat di sini, supaya mudah diingat nanti.")}
      </p>
      {onAdd && (
        <button className="button primary" onClick={onAdd}>
          <Plus size={17} />
          Catat transaksi pertama
        </button>
      )}
      {onClear && (
        <button className="button secondary" onClick={onClear}>
          Hapus filter
        </button>
      )}
    </div>
  );
}
export function KindIcon({ kind }: { kind: "income" | "expense" }) {
  return (
    <span className={`kind-icon ${kind}`}>
      {kind === "income" ? (
        <ArrowDownLeft size={19} />
      ) : (
        <ArrowUpRight size={19} />
      )}
    </span>
  );
}
export function TransactionList({
  transactions,
  ledger,
  onEdit,
  compact = false,
}: {
  transactions: Transaction[];
  ledger: Ledger;
  onEdit: (t: Transaction) => void;
  compact?: boolean;
}) {
  const categories = new Map(ledger.categories.map((c) => [c.id, c]));
  return (
    <div className={`transaction-list ${compact ? "compact" : ""}`}>
      {!compact && (
        <div className="transaction-table-head" aria-hidden="true">
          <span>Transaksi</span>
          <span>Kategori</span>
          <span>Tanggal</span>
          <span>Nominal</span>
          <span />
        </div>
      )}
      {transactions.map((t) => (
        <button
          className="transaction-row"
          key={t.id}
          onClick={() => onEdit(t)}
          aria-label={`Ubah ${t.kind === "income" ? "pemasukan" : "pengeluaran"} ${t.note || categories.get(t.categoryId)?.name}, ${money(t.amount, ledger.preferences.hideAmounts)}, ${dateLabel(t.date, ledger.preferences.dateFormat)}`}
        >
          <span className="transaction-main">
            <KindIcon kind={t.kind} />
            <span>
              <strong>{t.note || categories.get(t.categoryId)?.name}</strong>
              <small>
                {t.kind === "income" ? "Pemasukan" : "Pengeluaran"}
                {compact &&
                  ` · ${dateLabel(t.date, ledger.preferences.dateFormat)}`}
                {!compact && (
                  <span className="mobile-category">
                    {" "}
                    · {categories.get(t.categoryId)?.name}
                  </span>
                )}
              </small>
            </span>
          </span>
          {!compact && (
            <span className="transaction-category">
              {categories.get(t.categoryId)?.name}
              {categories.get(t.categoryId)?.archived && (
                <small>Diarsipkan</small>
              )}
            </span>
          )}
          <span className="transaction-date">
            {dateLabel(t.date, ledger.preferences.dateFormat)}
          </span>
          <span className={`transaction-amount ${t.kind}`}>
            {t.kind === "income" ? "+" : "−"}
            {money(t.amount, ledger.preferences.hideAmounts)}
          </span>
          <ChevronRight size={15} className="row-chevron" />
        </button>
      ))}
    </div>
  );
}
export const periodOptions: { value: Period; label: string }[] = [
  { value: "today", label: "Hari ini" },
  { value: "week", label: "Minggu ini" },
  { value: "month", label: "Bulan ini" },
  { value: "year", label: "Tahun ini" },
  { value: "all", label: "Semua waktu" },
  { value: "custom", label: "Rentang khusus" },
];
export function usePeriod(defaultPeriod: Period = "month") {
  const [params, setParams] = useSearchParams();
  const rawPeriod = params.get("period");
  const period = periodOptions.some((p) => p.value === rawPeriod)
    ? (rawPeriod as Period)
    : defaultPeriod;
  const rawStart = params.get("start") ?? localDate();
  const rawEnd = params.get("end") ?? localDate();
  const custom =
    validDate(rawStart) && validDate(rawEnd) && rawStart <= rawEnd
      ? { start: rawStart, end: rawEnd }
      : { start: localDate(), end: localDate() };
  const range = dateRange(period, custom);
  function update(values: Record<string, string>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(values))
          if (value) next.set(key, value);
          else next.delete(key);
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  }
  return {
    period,
    range,
    params,
    update,
    label:
      period === "all"
        ? "Semua waktu"
        : `${dateLabel(range.start)} – ${dateLabel(range.end)}`,
  };
}
export function PeriodPicker({
  period,
  range,
  onChange,
}: {
  period: Period;
  range: DateRange;
  onChange: (values: Record<string, string>) => void;
}) {
  return (
    <div className="period-picker">
      <label className="sr-only" htmlFor="period">
        Periode
      </label>
      <SelectField
        id="period"
        value={period}
        onValueChange={(value) => onChange({ period: value })}
        options={periodOptions}
      />
      {period === "custom" && (
        <div className="date-range">
          <label>
            <span className="sr-only">Dari tanggal</span>
            <input
              type="date"
              min="1900-01-01"
              max={range.end}
              value={range.start}
              onChange={(e) => {
                if (e.target.value) onChange({ start: e.target.value });
              }}
            />
          </label>
          <span>—</span>
          <label>
            <span className="sr-only">Sampai tanggal</span>
            <input
              type="date"
              min={range.start}
              max="9999-12-31"
              value={range.end}
              onChange={(e) => {
                if (e.target.value) onChange({ end: e.target.value });
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
export function Pagination({
  page,
  count,
  pageSize = 30,
  onChange,
}: {
  page: number;
  count: number;
  pageSize?: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return (
    <div className="pagination">
      <p>
        {count === 0
          ? "0 transaksi"
          : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, count)} dari ${count.toLocaleString("id-ID")} transaksi`}
      </p>
      <div>
        <button
          className="icon-button"
          aria-label="Halaman sebelumnya"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          className="icon-button"
          aria-label="Halaman berikutnya"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
export function CategoryBreakdown({
  transactions,
  categories,
  hidden,
  onSelect,
}: {
  transactions: Transaction[];
  categories: Category[];
  hidden: boolean;
  onSelect: (id: string) => void;
}) {
  const map = new Map<string, number>();
  for (const t of transactions)
    if (t.kind === "expense")
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
  const sorted = [...map].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, n]) => s + n, 0);
  if (!sorted.length)
    return (
      <div className="quiet-empty">
        <p>Belum ada pengeluaran di periode ini.</p>
        <span>Rincian kategori akan muncul setelah kamu mulai mencatat.</span>
      </div>
    );
  return (
    <div className="category-breakdown">
      {sorted.map(([id, amount], i) => (
        <button
          className="category-bar-row"
          key={id}
          onClick={() => onSelect(id)}
        >
          <span className="category-bar-heading">
            <span>
              <i className={`category-dot color-${i % 5}`} />
              {categories.find((c) => c.id === id)?.name}
            </span>
            <strong>{money(amount, hidden)}</strong>
          </span>
          <span className="bar-track">
            <span
              className={`bar-fill color-${i % 5}`}
              style={{ width: `${(amount / total) * 100}%` }}
            />
          </span>
          <span className="bar-percentage">
            {Math.round((amount / total) * 100)}% dari pengeluaran
          </span>
        </button>
      ))}
    </div>
  );
}
