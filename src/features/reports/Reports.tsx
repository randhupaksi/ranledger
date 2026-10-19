import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Download,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useMemo, useState } from "react";
import { useLedger, useNotify } from "../../components/LedgerProvider";
import {
  CategoryBreakdown,
  EmptyState,
  PageHeading,
  PeriodPicker,
  usePeriod,
} from "../../components/ui";
import {
  categoryTotals,
  dateLabel,
  errorMessage,
  filterTransactions,
  localDate,
  money,
  totals,
} from "../../domain/ledger";
import type { DateRange, Transaction } from "../../domain/ledger";
import { WalletPicker, ProgressMeter } from "../../components/planning-ui";
import { budgetProgresses, monthLabel } from "../../domain/planning";
import { FinancialPosition } from "./FinancialPosition";

function chartBuckets(transactions: Transaction[], range: DateRange) {
  if (!transactions.length) return [];
  const dates = transactions.map((t) => t.date).sort();
  const start = new Date(
    `${range.start === "1900-01-01" ? dates[0] : range.start}T12:00:00`,
  );
  const end = new Date(
    `${range.end === "9999-12-31" ? dates[dates.length - 1] : range.end}T12:00:00`,
  );
  const startDay =
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) /
    86_400_000;
  const endDay =
    Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) / 86_400_000;
  const span = Math.max(1, endDay - startDay + 1);
  const count = Math.min(8, span);
  const buckets = Array.from({ length: count }, (_, i) => {
    const date = new Date(
      (startDay + Math.floor((span * i) / count)) * 86_400_000,
    );
    return {
      label: `${date.getUTCDate()} ${date.toLocaleDateString("id-ID", { month: "short", timeZone: "UTC" })}`,
      income: 0,
      expense: 0,
    };
  });
  for (const t of transactions) {
    const day = Date.parse(`${t.date}T00:00:00Z`) / 86_400_000;
    const i = Math.min(
      count - 1,
      Math.floor(((day - startDay) / span) * count),
    );
    if (i >= 0) buckets[i][t.kind] += t.refund ? -t.amount : t.amount;
  }
  return buckets;
}
function CashflowChart({
  transactions,
  range,
  hidden,
}: {
  transactions: Transaction[];
  range: DateRange;
  hidden: boolean;
}) {
  const buckets = useMemo(
    () => chartBuckets(transactions, range),
    [transactions, range.start, range.end],
  );
  const max = Math.max(1, ...buckets.flatMap((b) => [b.income, b.expense]));
  return (
    <>
      <div
        className="chart"
        role="img"
        aria-label={`Perbandingan pemasukan dan pengeluaran dalam ${buckets.length} bagian periode. ${hidden ? "Nominal disembunyikan." : buckets.map((b) => `${b.label}: masuk ${money(b.income)}, keluar ${money(b.expense)}`).join(". ")}`}
      >
        <div className="chart-axis">
          {[1, 0.75, 0.5, 0.25, 0].map((n) => (
            <span key={n}>
              {hidden
                ? "•••"
                : n === 0
                  ? "0"
                  : Intl.NumberFormat("id-ID", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(max * n)}
            </span>
          ))}
        </div>
        <div className="chart-plot">
          <div className="chart-grid">
            {[0, 1, 2, 3, 4].map((n) => (
              <i key={n} />
            ))}
          </div>
          <div className="chart-columns">
            {buckets.map((b, i) => (
              <div className="chart-group" key={i}>
                <div className="chart-bars">
                  <div
                    className="chart-bar income-bar"
                    style={{
                      height: `${(b.income / max) * 100}%`,
                      minHeight: b.income ? 3 : 0,
                    }}
                    title={`Pemasukan ${money(b.income, hidden)}`}
                  />
                  <div
                    className="chart-bar expense-bar"
                    style={{
                      height: `${Math.max(0, (b.expense / max) * 100)}%`,
                      minHeight: b.expense ? 3 : 0,
                    }}
                    title={`Pengeluaran ${money(b.expense, hidden)}`}
                  />
                </div>
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="chart-help">
        Setiap pasangan batang merangkum satu bagian periode. Total pemasukan{" "}
        {money(totals(transactions).income, hidden)}, pengeluaran{" "}
        {money(totals(transactions).expense, hidden)}.
      </p>
    </>
  );
}
export default function Reports() {
  const ledger = useLedger();
  const notify = useNotify();
  const { period, range, update, label, params } = usePeriod();
  const walletId = params.get("wallet") ?? "";
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const filtered = useMemo(
    () =>
      filterTransactions(ledger.transactions, ledger.categories, {
        ...range,
        kind: "all",
        categoryId: "",
        search: "",
        walletId,
      }),
    [ledger.transactions, ledger.categories, range.start, range.end, walletId],
  );
  const summary = useMemo(() => totals(filtered), [filtered]);
  const hidden = ledger.preferences.hideAmounts;
  const categories = useMemo(
    () => categoryTotals(filtered, ledger.categories),
    [filtered, ledger.categories],
  );
  const query = new URLSearchParams({
    period,
    start: range.start,
    end: range.end,
    wallet: walletId,
  });
  const comparison = useMemo(() => {
    const startDate = new Date(`${range.start}T12:00:00`);
    const endDate = new Date(`${range.end}T12:00:00`);
    const days =
      Math.round(
        (Date.UTC(
          endDate.getFullYear(),
          endDate.getMonth(),
          endDate.getDate(),
        ) -
          Date.UTC(
            startDate.getFullYear(),
            startDate.getMonth(),
            startDate.getDate(),
          )) /
          86_400_000,
      ) + 1;
    const previousEnd = new Date(startDate);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(startDate);
    previousStart.setDate(previousStart.getDate() - days);
    const previous =
      period === "all" || days <= 0
        ? []
        : filterTransactions(ledger.transactions, ledger.categories, {
            start: localDate(previousStart),
            end: localDate(previousEnd),
            kind: "all",
            categoryId: "",
            search: "",
            walletId,
          });
    const previousExpense = totals(previous).expense;
    return {
      change:
        previousExpense > 0
          ? ((summary.expense - previousExpense) / previousExpense) * 100
          : null,
      days,
      previousStart,
      previousEnd,
    };
  }, [
    ledger.transactions,
    ledger.categories,
    period,
    range.start,
    range.end,
    summary.expense,
    walletId,
  ]);
  const budgets = useMemo(
    () =>
      period === "month"
        ? ledger.budgets.filter(
            (b) =>
              b.month === range.start.slice(0, 7) &&
              (walletId ? b.walletId === walletId : true),
          )
        : [],
    [ledger.budgets, period, range.start, walletId],
  );
  const budgetUsage = useMemo(
    () => budgetProgresses(budgets, ledger),
    [budgets, ledger.transactions],
  );
  async function download() {
    if (exporting) return;
    setExporting(true);
    try {
      const { exportReport } = await import("../../data/backup");
      await exportReport(
        filtered,
        ledger,
        `${label} · ${ledger.wallets.find((w) => w.id === walletId)?.name ?? "Semua dompet"}`,
      );
      notify("Laporan Excel dibuat sesuai periode.");
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="PAHAMI KEBIASAANMU"
        title="Laporan keuangan"
        description="Angka yang jelas untuk keputusan sehari-hari."
        action={
          <button
            className="button secondary"
            disabled={exporting || !filtered.length}
            onClick={() => void download()}
          >
            <Download size={17} />
            {exporting ? "Menyiapkan…" : "Ekspor laporan"}
          </button>
        }
      />
      <div className="report-period">
        <div>
          <h2>Pemasukan & pengeluaran</h2>
          <p>{label}</p>
        </div>
        <div className="report-filters">
          <WalletPicker
            label="Dompet laporan"
            value={walletId}
            onChange={(v) => update({ wallet: v })}
            all
          />
          <PeriodPicker period={period} range={range} onChange={update} />
        </div>
      </div>
      <FinancialPosition range={range} walletId={walletId} />
      <section className="period-summary report-summary">
        <Link to={`/transaksi?${query}&kind=income`} className="summary-item">
          <span className="summary-label">
            <ArrowDownLeft size={17} />
            Pemasukan
          </span>
          <strong className="income">{money(summary.income, hidden)}</strong>
          <span>
            {filtered.filter((t) => t.kind === "income").length} transaksi{" "}
            <ArrowRight size={14} />
          </span>
        </Link>
        <Link to={`/transaksi?${query}&kind=expense`} className="summary-item">
          <span className="summary-label">
            <ArrowUpRight size={17} />
            Pengeluaran
          </span>
          <strong>{money(summary.expense, hidden)}</strong>
          <span>
            {filtered.filter((t) => t.kind === "expense").length} transaksi{" "}
            <ArrowRight size={14} />
          </span>
        </Link>
        <Link to={`/transaksi?${query}`} className="summary-item">
          <span className="summary-label">Selisih periode</span>
          <strong>
            {summary.net > 0 ? "+" : ""}
            {money(summary.net, hidden)}
          </strong>
          <span>Tidak termasuk saldo awal</span>
        </Link>
      </section>
      {budgets.length > 0 && (
        <section className="surface report-budgets">
          <div className="section-heading">
            <div>
              <h2>Anggaran vs realisasi</h2>
              <p>
                {monthLabel(range.start.slice(0, 7))} · seluruh bulan, termasuk
                transaksi mendatang
              </p>
            </div>
            <Link
              className="text-link"
              to={`/anggaran?month=${range.start.slice(0, 7)}`}
            >
              Kelola →
            </Link>
          </div>
          {budgets.map((b) => {
            const p = budgetUsage.get(b.id)!;
            return (
              <div className="report-budget-row" key={b.id}>
                <div>
                  <strong>
                    {ledger.categories.find((c) => c.id === b.categoryId)?.name}
                  </strong>
                  <small>
                    {ledger.wallets.find((w) => w.id === b.walletId)?.name ??
                      "Semua dompet"}
                  </small>
                </div>
                <ProgressMeter
                  label="Realisasi anggaran"
                  value={p.ratio}
                  hidden={hidden}
                  warning={p.status !== "normal"}
                />
                <span>
                  {money(p.spent, hidden)} / {money(b.amount, hidden)}
                </span>
              </div>
            );
          })}
        </section>
      )}
      {!filtered.length ? (
        <section className="surface">
          <EmptyState
            filtered
            title="Belum ada data untuk dirangkum"
            description="Catat transaksi atau pilih periode lain. Ringkasan dan pola pengeluaran akan muncul di sini."
          />
        </section>
      ) : (
        <>
          <section className="surface cashflow-section">
            <div className="section-heading">
              <div>
                <h2>Pemasukan & pengeluaran</h2>
                <p>Perjalanan uang dalam periode pilihan</p>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-income" />
                  Masuk
                </span>
                <span>
                  <i className="legend-expense" />
                  Keluar
                </span>
              </div>
            </div>
            <CashflowChart
              transactions={filtered}
              range={range}
              hidden={hidden}
            />
          </section>
          <div className="dashboard-columns report-columns">
            <section className="surface">
              <div className="section-heading">
                <div>
                  <h2>Rincian pengeluaran</h2>
                  <p>Pilih kategori untuk melihat transaksinya</p>
                </div>
              </div>
              <CategoryBreakdown
                transactions={filtered}
                categories={ledger.categories}
                items={categories}
                hidden={hidden}
                onSelect={(id) =>
                  navigate(`/transaksi?${query}&kind=expense&category=${id}`)
                }
              />
            </section>
            <section className="report-notes">
              <p className="eyebrow">YANG BISA KAMU LIHAT</p>
              {categories[0] ? (
                <>
                  <h2>{categories[0].name}</h2>
                  <p>
                    Kategori dengan pengeluaran terbesar:{" "}
                    <strong>{money(categories[0].amount, hidden)}</strong>, atau{" "}
                    {Math.round((categories[0].amount / summary.expense) * 100)}
                    % dari pengeluaran periode ini.
                  </p>
                </>
              ) : (
                <>
                  <h2>Belum ada pengeluaran</h2>
                  <p>
                    Periode ini baru berisi pemasukan. Rincian pengeluaran akan
                    muncul setelah ada catatan.
                  </p>
                </>
              )}
              {comparison.change !== null && (
                <div className="comparison-note">
                  <strong>
                    Pengeluaran{" "}
                    {Math.abs(comparison.change).toLocaleString("id-ID", {
                      maximumFractionDigits: 1,
                    })}
                    %{" "}
                    {comparison.change > 0
                      ? "lebih tinggi"
                      : comparison.change < 0
                        ? "lebih rendah"
                        : "sama"}
                  </strong>
                  <p>
                    Dibanding {comparison.days} hari sebelumnya (
                    {dateLabel(localDate(comparison.previousStart))} –{" "}
                    {dateLabel(localDate(comparison.previousEnd))}).
                    Perbandingan berdasarkan catatan yang tersedia.
                  </p>
                </div>
              )}
              <Link className="text-link" to={`/transaksi?${query}`}>
                Telusuri semua {filtered.length} transaksi{" "}
                <ArrowRight size={16} />
              </Link>
            </section>
          </div>
        </>
      )}
      <p className="page-footnote">
        Selisih periode = pemasukan − pengeluaran. Saldo keseluruhan dan saldo
        awal bisa dilihat di Beranda. Transfer antar dompet tidak dihitung
        sebagai pemasukan atau pengeluaran.
      </p>
    </>
  );
}
