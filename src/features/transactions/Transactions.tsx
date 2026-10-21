import { useDeferredValue, useMemo, useState } from "react";
import { Download, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { WalletPicker } from "../../components/planning-ui";
import { useLedger, useNotify } from "../../components/LedgerProvider";
import { SelectField } from "../../components/SelectField";
import {
  EmptyState,
  PageHeading,
  Pagination,
  PeriodPicker,
  TransactionList,
  usePeriod,
} from "../../components/ui";
import {
  errorMessage,
  filterTransactions,
  money,
  totals,
} from "../../domain/ledger";
import type { Transaction, TransactionKind } from "../../domain/ledger";

export default function Transactions({
  onAdd,
  onEdit,
}: {
  onAdd: () => void;
  onEdit: (transaction: Transaction) => void;
}) {
  const ledger = useLedger();
  const notify = useNotify();
  const { period, range, update, params, label } = usePeriod("all");
  const [, setParams] = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const search = params.get("q") ?? "";
  const deferredSearch = useDeferredValue(search);
  const rawKind = params.get("kind");
  const kind: TransactionKind | "all" =
    rawKind === "income" || rawKind === "expense" ? rawKind : "all";
  const categoryId = params.get("category") ?? "";
  const walletId = params.get("wallet") ?? "";
  const filtered = useMemo(
    () =>
      filterTransactions(ledger.transactions, ledger.categories, {
        ...range,
        kind,
        categoryId,
        walletId,
        search: deferredSearch,
      }),
    [
      ledger.transactions,
      ledger.categories,
      range.start,
      range.end,
      kind,
      categoryId,
      walletId,
      deferredSearch,
    ],
  );
  const summary = useMemo(() => totals(filtered), [filtered]);
  const netTone =
    summary.net > 0 ? "positive" : summary.net < 0 ? "negative" : "neutral";
  const page = Math.min(
    Math.max(1, Math.floor(Number(params.get("page")) || 1)),
    Math.max(1, Math.ceil(filtered.length / 30)),
  );
  const active =
    search || categoryId || walletId || kind !== "all" || period !== "all";
  async function report() {
    if (exporting) return;
    setExporting(true);
    try {
      const { exportReport } = await import("../../data/backup");
      await exportReport(
        filtered,
        ledger,
        `${label} · ${walletId ? ledger.wallets.find((w) => w.id === walletId)?.name : "Semua dompet"} · ${kind === "all" ? "Semua jenis" : kind === "income" ? "Pemasukan" : "Pengeluaran"}${categoryId ? ` · ${ledger.categories.find((c) => c.id === categoryId)?.name ?? "Kategori"}` : ""}${search ? ` · Pencarian: ${search}` : ""}`,
      );
      notify(
        "Laporan Excel dibuat. Untuk pemulihan lengkap, gunakan menu Backup.",
      );
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="CATATAN HARIAN"
        title="Transaksi"
        description="Setiap pemasukan dan pengeluaran, di satu tempat."
        action={
          <>
            <Link className="button secondary" to="/impor">
              Impor Excel
            </Link>
            <button className="button primary" onClick={onAdd}>
              <Plus size={18} />
              Catat transaksi
            </button>
          </>
        }
      />
      <section className="surface transactions-surface">
        <div className="filter-toolbar">
          <label className="search-field">
            <Search size={18} />
            <span className="sr-only">Cari transaksi</span>
            <input
              placeholder="Cari catatan atau kategori…"
              value={search}
              onChange={(e) => update({ q: e.target.value })}
            />
            {search && (
              <button
                className="icon-button"
                aria-label="Hapus pencarian"
                onClick={() => update({ q: "" })}
              >
                <X size={16} />
              </button>
            )}
          </label>
          <button
            className="button secondary report-download"
            onClick={() => void report()}
            disabled={exporting || !filtered.length}
          >
            <Download size={17} />
            {exporting ? "Menyiapkan…" : "Ekspor laporan"}
          </button>
        </div>
        <div className="filter-controls">
          <SlidersHorizontal size={16} className="filter-symbol" />
          <PeriodPicker period={period} range={range} onChange={update} />
          <WalletPicker
            label="Dompet transaksi"
            value={walletId}
            onChange={(value) => update({ wallet: value })}
            all
          />
          <label>
            <span className="sr-only">Jenis transaksi</span>
            <SelectField
              value={kind}
              onValueChange={(value) => update({ kind: value, category: "" })}
              options={[
                { value: "all", label: "Semua jenis" },
                { value: "expense", label: "Pengeluaran" },
                { value: "income", label: "Pemasukan" },
              ]}
            />
          </label>
          <label>
            <span className="sr-only">Kategori transaksi</span>
            <SelectField
              value={categoryId}
              onValueChange={(value) => update({ category: value })}
              options={[
                { value: "", label: "Semua kategori" },
                ...ledger.categories
                  .filter((c) => kind === "all" || c.kind === kind)
                  .map((category) => ({
                    value: category.id,
                    label: `${category.name}${kind === "all" ? (category.kind === "income" ? " · masuk" : " · keluar") : ""}${category.archived ? " (arsip)" : ""}`,
                  })),
              ]}
            />
          </label>
          {active && (
            <button
              className="text-link muted"
              onClick={() => setParams({}, { replace: true })}
            >
              <X size={14} />
              Reset filter
            </button>
          )}
        </div>
        <div className="filtered-summary">
          <span>
            <strong>{filtered.length.toLocaleString("id-ID")}</strong> transaksi
          </span>
          <span>
            Masuk{" "}
            <b className="income">
              {money(summary.income, ledger.preferences.hideAmounts)}
            </b>
          </span>
          <span>
            Keluar{" "}
            <b className="expense">
              {money(summary.expense, ledger.preferences.hideAmounts)}
            </b>
          </span>
          <span>
            Selisih{" "}
            <b className={netTone}>
              {summary.net > 0 ? "+" : ""}
              {money(summary.net, ledger.preferences.hideAmounts)}
            </b>
          </span>
        </div>
        {filtered.length ? (
          <TransactionList
            transactions={filtered.slice((page - 1) * 30, page * 30)}
            ledger={ledger}
            onEdit={onEdit}
          />
        ) : (
          <EmptyState
            filtered={Boolean(active) || ledger.transactions.length > 0}
            onAdd={ledger.transactions.length === 0 ? onAdd : undefined}
            onClear={active ? () => setParams({}) : undefined}
          />
        )}
        <Pagination
          page={page}
          count={filtered.length}
          onChange={(next) =>
            setParams(
              (prev) => {
                const p = new URLSearchParams(prev);
                p.set("page", String(next));
                return p;
              },
              { replace: true },
            )
          }
        />
      </section>
      <p className="page-footnote">
        Ekspor laporan mengikuti filter di layar. Backup lengkap tersedia di
        menu Backup & Pemulihan.
      </p>
    </>
  );
}
