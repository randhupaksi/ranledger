import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useMemo, lazy, Suspense } from "react";
import { useLedger, useNotify } from "../../components/LedgerProvider";
import {
  CategoryBreakdown,
  EmptyState,
  PeriodPicker,
  TransactionList,
  usePeriod,
} from "../../components/ui";
import { db } from "../../data/database";
import {
  categoryTotals,
  errorMessage,
  filterTransactions,
  money,
  totals,
} from "../../domain/ledger";
import type { Transaction } from "../../domain/ledger";
import { ledgerTotals } from "../../domain/planning";
import PlanningOverview from "./PlanningOverview";
const FinancialBriefing = lazy(() =>
  import("./FinancialBriefing").then((module) => ({
    default: module.FinancialBriefing,
  })),
);

export default function Dashboard({
  onAdd,
  onEdit,
}: {
  onAdd: () => void;
  onEdit: (transaction: Transaction) => void;
}) {
  const ledger = useLedger();
  const notify = useNotify();
  const { period, range, update, label } = usePeriod();
  const navigate = useNavigate();
  const filtered = useMemo(
    () =>
      filterTransactions(ledger.transactions, ledger.categories, {
        ...range,
        kind: "all",
        categoryId: "",
        search: "",
      }),
    [ledger.transactions, ledger.categories, range.start, range.end],
  );
  const summary = useMemo(() => totals(filtered), [filtered]);
  const overall = useMemo(
    () => ledgerTotals(ledger),
    [ledger.transactions, ledger.wallets],
  );
  const hidden = ledger.preferences.hideAmounts;
  const categorySummary = useMemo(
    () => categoryTotals(filtered, ledger.categories),
    [filtered, ledger.categories],
  );
  const biggest = categorySummary[0];
  const backupAge = ledger.preferences.lastBackupAt
    ? Math.floor(
        (Date.now() - new Date(ledger.preferences.lastBackupAt).getTime()) /
          86_400_000,
      )
    : null;
  const backupDue =
    ledger.transactions.length > 0 && (backupAge === null || backupAge >= 7);
  const query = new URLSearchParams({
    period,
    start: range.start,
    end: range.end,
  });
  const netTone =
    summary.net > 0 ? "positive" : summary.net < 0 ? "negative" : "neutral";
  return (
    <>
      <section className="dashboard-hero" aria-label="Keuanganmu hari ini">
        <div className="dashboard-hero-primary">
          <div className="dashboard-hero-intro">
            <div>
              <p className="eyebrow">RUANG KEUANGANMU</p>
              <h1>Keuanganmu hari ini</h1>
              <p className="page-description">
                Saldo, rencana, dan catatanmu dalam satu pandangan.
              </p>
            </div>
            <div className="heading-actions">
              <button className="button primary" onClick={onAdd}>
                <Plus size={18} />
                Catat transaksi
              </button>
            </div>
          </div>
          <div className="dashboard-hero-balance">
            <div className="balance-label">
              Saldo tercatat
              <button
                className="balance-visibility"
                aria-label={
                  hidden ? "Tampilkan nominal" : "Sembunyikan nominal"
                }
                onClick={() =>
                  void db
                    .updatePreferences({ hideAmounts: !hidden })
                    .catch((e) => notify(errorMessage(e), true))
                }
              >
                {hidden ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <p className="balance-amount">{money(overall.balance, hidden)}</p>
            <p className="balance-context">Saldo gabungan seluruh dompet</p>
            <div className="balance-foot">
              <span className="balance-chip">
                <span />
                Tersimpan di perangkat ini
              </span>
              <span>IDR · Rupiah</span>
            </div>
          </div>
        </div>
        <aside className="dashboard-hero-rail" aria-label="Rincian saldo">
          <p className="eyebrow">RINGKASAN SALDO</p>
          <dl className="dashboard-hero-metrics">
            <div>
              <dt>Saldo awal</dt>
              <dd>{money(overall.balance - overall.net, hidden)}</dd>
            </div>
            <div className="income">
              <dt>Total pemasukan</dt>
              <dd>{money(overall.income, hidden)}</dd>
            </div>
            <div className="expense">
              <dt>Total pengeluaran</dt>
              <dd>−{money(overall.expense, hidden)}</dd>
            </div>
          </dl>
          <Link className="dashboard-hero-link" to="/dompet">
            Kelola dompet <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </aside>
      </section>
      <Suspense fallback={null}>
        <FinancialBriefing />
      </Suspense>
      {!ledger.preferences.onboarded && (
        <div className="welcome-note">
          <ShieldCheck size={21} />
          <p>
            <strong>Selamat datang di Ranledger.</strong> Mulai dari satu
            catatan, periksa ruang aktif sebelum mencatat, dan buat backup untuk
            menjaga salinannya.
          </p>
          <button
            className="text-link"
            onClick={() =>
              void db
                .updatePreferences({ onboarded: true })
                .catch((e) => notify(errorMessage(e), true))
            }
          >
            Mengerti <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      <PlanningOverview />
      <div className="section-heading period-heading">
        <div>
          <h2>Ringkasan periode</h2>
          <p>{label}</p>
        </div>
        <PeriodPicker period={period} range={range} onChange={update} />
      </div>
      <section
        className="period-summary"
        aria-label="Ringkasan keuangan periode"
      >
        <Link
          to={`/transaksi?${query}&kind=income`}
          className="summary-item income-summary"
        >
          <span className="summary-label">
            <ArrowDownLeft size={14} />
            Pemasukan
          </span>
          <strong className="income">{money(summary.income, hidden)}</strong>
          <span>
            Lihat pemasukan <ArrowRight size={14} aria-hidden="true" />
          </span>
        </Link>
        <Link
          to={`/transaksi?${query}&kind=expense`}
          className="summary-item expense-summary"
        >
          <span className="summary-label">
            <ArrowUpRight size={14} />
            Pengeluaran
          </span>
          <strong className="expense">{money(summary.expense, hidden)}</strong>
          <span>
            Lihat pengeluaran <ArrowRight size={14} aria-hidden="true" />
          </span>
        </Link>
        <Link
          to={`/laporan?${query}`}
          className={`summary-item net-summary ${netTone}`}
        >
          <span className="summary-label">Selisih periode</span>
          <strong className={netTone}>
            {summary.net > 0 ? "+" : ""}
            {money(summary.net, hidden)}
          </strong>
          <span>Pemasukan dikurangi pengeluaran</span>
        </Link>
      </section>
      <div className="dashboard-columns">
        <section className="surface recent-section">
          <div className="section-heading">
            <div>
              <h2>Transaksi terakhir</h2>
              <p>
                {filtered.length.toLocaleString("id-ID")} catatan dalam periode
                ini
              </p>
            </div>
            <Link className="text-link" to={`/transaksi?${query}`}>
              Lihat semua <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          {filtered.length ? (
            <TransactionList
              transactions={filtered.slice(0, 5)}
              ledger={ledger}
              onEdit={onEdit}
              compact
            />
          ) : (
            <EmptyState
              filtered={ledger.transactions.length > 0}
              onAdd={onAdd}
            />
          )}
        </section>
        <section className="surface spending-section">
          <div className="section-heading">
            <div>
              <h2>Ke mana uangmu?</h2>
              <p>Pengeluaran menurut kategori</p>
            </div>
          </div>
          <CategoryBreakdown
            transactions={filtered}
            categories={ledger.categories}
            items={categorySummary}
            hidden={hidden}
            onSelect={(id) =>
              navigate(`/transaksi?${query}&kind=expense&category=${id}`)
            }
          />
          {biggest && (
            <p className="spending-insight">
              <strong>{biggest.name}</strong> adalah pengeluaran terbesar di
              periode ini.
            </p>
          )}
        </section>
      </div>
      {backupDue && (
        <Link to="/backup" className="backup-reminder">
          <ShieldCheck size={21} />
          <span>
            <strong>
              {backupAge === null
                ? "Sudah mencatat? Jaga salinannya juga."
                : `Backup terakhir dibuat ${backupAge} hari lalu.`}
            </strong>
            <small>
              Unduh backup untuk berjaga saat ganti perangkat atau membersihkan
              browser.
            </small>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      )}
      <p className="page-footnote">
        Keuangan pribadi, dalam kendalimu. Tanpa akun. Tanpa sinkronisasi
        otomatis.
      </p>
    </>
  );
}
