import { EditorDialog } from "../../components/EditorDialog";
import { MonthPicker } from "../../components/DatePicker";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowRight, PieChart, Plus } from "lucide-react";
import { useLedger } from "../../components/LedgerProvider";
import { EmptyState, PageHeading } from "../../components/ui";
import {
  AmountField,
  ProgressMeter,
  WalletPicker,
} from "../../components/planning-ui";
import { SelectField } from "../../components/SelectField";
import { db } from "../../data/database";
import type { Budget } from "../../domain/ledger";
import { localDate, money, parseAmount, validDate } from "../../domain/ledger";
import { budgetProgresses, monthLabel } from "../../domain/planning";

function BudgetEditor({
  budget,
  month,
  onClose,
}: {
  budget?: Budget;
  month: string;
  onClose: () => void;
}) {
  const ledger = useLedger();
  const [id] = useState(() => budget?.id ?? crypto.randomUUID());
  const [selectedMonth, setMonth] = useState(budget?.month ?? month);
  const [categoryId, setCategoryId] = useState(
    budget?.categoryId ??
      ledger.categories.find((c) => c.kind === "expense" && !c.archived)?.id ??
      "",
  );
  const [walletId, setWalletId] = useState(budget?.walletId ?? "");
  const [amount, setAmount] = useState(
    budget?.amount.toLocaleString("id-ID") ?? "",
  );
  return (
    <EditorDialog
      title={budget ? "Ubah anggaran" : "Atur anggaran"}
      description="Batas pengeluaran per kategori untuk satu bulan. Anggaran tidak otomatis dibawa ke bulan berikutnya."
      onClose={onClose}
      saveLabel="Simpan anggaran"
      onDelete={budget ? () => db.removeEntity("budgets", budget) : undefined}
      onSave={() =>
        db.saveEntity(
          "budgets",
          {
            id,
            month: selectedMonth,
            categoryId,
            walletId: walletId || null,
            amount: parseAmount(amount),
            updatedAt: budget?.updatedAt ?? new Date().toISOString(),
          },
          Boolean(budget),
        )
      }
    >
      <div className="field">
        <label htmlFor="budget-month">Bulan anggaran</label>
        <MonthPicker
          id="budget-month"
          min="1900-01"
          max="9999-12"
          value={selectedMonth}
          onChange={setMonth}
        />
      </div>
      <div className="field">
        <label htmlFor="budget-category">Kategori anggaran</label>
        <SelectField
          id="budget-category"
          value={categoryId}
          onValueChange={setCategoryId}
          options={ledger.categories
            .filter(
              (c) =>
                c.kind === "expense" &&
                (!c.archived || c.id === budget?.categoryId),
            )
            .map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
      <WalletPicker
        value={walletId}
        onChange={setWalletId}
        all
        label="Cakupan dompet"
      />
      <AmountField
        label="Batas pengeluaran (Rp)"
        value={amount}
        onChange={setAmount}
      />
      <p className="field-hint">
        Cakupan semua dompet menghitung seluruh pengeluaran kategori ini.
        Transfer tidak memakai anggaran.
      </p>
    </EditorDialog>
  );
}
export default function Budgets() {
  const ledger = useLedger();
  const [params, setParams] = useSearchParams();
  const rawMonth = params.get("month") ?? localDate().slice(0, 7);
  const month = validDate(rawMonth + "-01")
    ? rawMonth
    : localDate().slice(0, 7);
  const [walletId, setWalletId] = useState("");
  const [editor, setEditor] = useState<Budget | "new" | null>(null);
  const budgets = useMemo(
    () =>
      ledger.budgets
        .filter(
          (b) => b.month === month && (!walletId || b.walletId === walletId),
        )
        .sort((a, b) => a.categoryId.localeCompare(b.categoryId)),
    [ledger.budgets, month, walletId],
  );
  const progress = useMemo(
    () => budgetProgresses(budgets, ledger),
    [budgets, ledger.transactions],
  );
  const hidden = ledger.preferences.hideAmounts;
  const names = new Map(ledger.categories.map((c) => [c.id, c.name]));
  const wallets = new Map(ledger.wallets.map((w) => [w.id, w.name]));
  const near = [...progress.values()].filter((p) => p.status === "near").length;
  const over = [...progress.values()].filter((p) => p.status === "over").length;
  return (
    <>
      <PageHeading
        eyebrow="RENCANA PENGELUARAN"
        title="Anggaran bulanan"
        description="Beri batas yang masuk akal untuk pengeluaranmu."
        action={
          <button className="button primary" onClick={() => setEditor("new")}>
            <Plus size={17} />
            Atur anggaran
          </button>
        }
      />
      <div className="planning-toolbar">
        <div className="field">
          <label htmlFor="view-month">Periode anggaran</label>
          <MonthPicker
            id="view-month"
            min="1900-01"
            max="9999-12"
            value={month}
            onChange={(value) => setParams({ month: value })}
          />
        </div>
        <WalletPicker
          label="Filter cakupan"
          value={walletId}
          onChange={setWalletId}
          all
        />
      </div>
      <div className="plan-overview">
        <h2>{monthLabel(month)}</h2>
        <p>
          {budgets.length} anggaran
          {!hidden && ` · ${near} mendekati batas · ${over} mencapai batas`}
        </p>
      </div>
      <section className="surface budget-register">
        {budgets.length ? (
          budgets.map((b) => {
            const p = progress.get(b.id)!;
            const status = hidden
              ? "Nominal disembunyikan"
              : p.status === "over"
                ? p.remaining < 0
                  ? "Melebihi anggaran"
                  : "Batas tercapai"
                : p.status === "near"
                  ? "Mendekati batas"
                  : "Dalam anggaran";
            const query = new URLSearchParams({
              period: "custom",
              start: `${month}-01`,
              end: localDate(
                new Date(
                  Number(month.slice(0, 4)),
                  Number(month.slice(5, 7)),
                  0,
                  12,
                ),
              ),
              kind: "expense",
              category: b.categoryId,
              ...(b.walletId ? { wallet: b.walletId } : {}),
            });
            return (
              <div className="budget-line" key={b.id}>
                <div className="budget-heading">
                  <div>
                    <h3>{names.get(b.categoryId)}</h3>
                    <p>
                      {b.walletId ? wallets.get(b.walletId) : "Semua dompet"}
                    </p>
                  </div>
                  <button
                    className="text-link"
                    aria-label={`Ubah anggaran ${names.get(b.categoryId)}`}
                    onClick={() => setEditor(b)}
                  >
                    Ubah
                  </button>
                </div>
                <div className="budget-figures">
                  <strong>
                    {money(p.spent, hidden)}{" "}
                    <span>dari {money(b.amount, hidden)}</span>
                  </strong>
                  <span
                    className={
                      hidden
                        ? "muted"
                        : p.status === "over"
                          ? "expense"
                          : p.status === "near"
                            ? "warning-text"
                            : "muted"
                    }
                  >
                    {status}
                  </span>
                </div>
                <ProgressMeter
                  value={p.ratio}
                  label={`Pemakaian anggaran ${names.get(b.categoryId)}`}
                  warning={p.status !== "normal"}
                  hidden={hidden}
                />
                <div className="budget-foot">
                  <span>
                    {p.remaining < 0 ? "Lebih" : "Sisa"}{" "}
                    {money(Math.abs(p.remaining), hidden)}
                  </span>
                  <Link className="text-link" to={`/transaksi?${query}`}>
                    Lihat pengeluaran{" "}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            icon={PieChart}
            tone="warning"
            title="Atur batas untuk bulan ini"
            description="Pilih kategori yang ingin kamu kendalikan, seperti makan atau transportasi."
            action={
              <button
                className="button primary"
                onClick={() => setEditor("new")}
              >
                Buat anggaran pertama
              </button>
            }
          />
        )}
      </section>
      <p className="page-footnote">
        Pemakaian mencakup semua transaksi bertanggal dalam bulan pilihan,
        termasuk tanggal mendatang. Anggaran kategori yang sama pada cakupan
        berbeda dapat saling tumpang tindih.
      </p>
      {editor && (
        <BudgetEditor
          budget={editor === "new" ? undefined : editor}
          month={month}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
