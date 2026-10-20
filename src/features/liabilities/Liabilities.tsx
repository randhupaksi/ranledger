import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useLedger } from "../../components/LedgerProvider";
import { PageHeading } from "../../components/ui";
import { EditorDialog } from "../../components/EditorDialog";
import { DatePicker } from "../../components/DatePicker";
import { AmountField } from "../../components/planning-ui";
import { SelectField } from "../../components/SelectField";
import { WalletEditor } from "../wallets/Wallets";
import { db } from "../../data/database";
import {
  dateLabel,
  localDate,
  money,
  parseAmount,
  type LiabilityTerms,
  type Wallet,
} from "../../domain/ledger";
import { isLiability, position } from "../../domain/finance";
import { calendarItems, addDays } from "../../domain/forecast";
function TermsEditor({
  wallet,
  onClose,
}: {
  wallet: Wallet;
  onClose: () => void;
}) {
  const ledger = useLedger(),
    old = ledger.liabilities.find((t) => t.walletId === wallet.id);
  const [amount, setAmount] = useState(
      old?.paymentAmount.toLocaleString("id-ID") ?? "",
    ),
    [source, setSource] = useState(
      old?.paymentWalletId ??
        ledger.wallets.find((w) => !isLiability(w) && !w.archived)?.id ??
        "",
    ),
    [due, setDue] = useState(old?.dueDay ?? 10),
    [statement, setStatement] = useState(old?.statementDay ?? 1),
    [date, setDate] = useState(old?.startDate ?? localDate()),
    [count, setCount] = useState(old?.installments ?? 0);
  return (
    <EditorDialog
      title={`Atur pembayaran ${wallet.name}`}
      description="Jadwal ini membentuk proyeksi. Saldo baru berubah ketika pembayaran dicatat."
      onClose={onClose}
      saveLabel="Simpan aturan pembayaran"
      onDelete={old ? () => db.removeEntity("liabilities", old) : undefined}
      onSave={() => {
        const term: LiabilityTerms = {
          id: old?.id ?? crypto.randomUUID(),
          walletId: wallet.id,
          paymentWalletId: source,
          paymentAmount: parseAmount(amount),
          dueDay: due,
          statementDay: statement,
          startDate: date,
          installments: count,
          updatedAt: old?.updatedAt ?? new Date().toISOString(),
        };
        return db.saveEntity("liabilities", term, Boolean(old));
      }}
    >
      <div className="field">
        <label htmlFor="payment-source">Sumber pembayaran</label>
        <SelectField
          id="payment-source"
          value={source}
          onValueChange={setSource}
          options={ledger.wallets
            .filter((w) => !isLiability(w) && !w.archived)
            .map((w) => ({ value: w.id, label: w.name }))}
        />
      </div>
      <AmountField
        label="Rencana pembayaran bulanan (Rp)"
        value={amount}
        onChange={setAmount}
      />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="statement-day">Tanggal tutup tagihan</label>
          <input
            id="statement-day"
            type="number"
            min="1"
            max="31"
            placeholder="1–31"
            value={statement}
            onChange={(e) => setStatement(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="due-day">Tanggal jatuh tempo</label>
          <input
            id="due-day"
            type="number"
            min="1"
            max="31"
            placeholder="1–31"
            value={due}
            onChange={(e) => setDue(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="liability-start">Mulai pembayaran</label>
        <DatePicker id="liability-start" value={date} onChange={setDate} />
      </div>
      <div className="field">
        <label htmlFor="installment-count">Jumlah cicilan</label>
        <input
          id="installment-count"
          type="number"
          min="0"
          max="600"
          placeholder="0 = berulang"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <p className="field-hint">
          0 untuk berulang selama masih ada utang. Tanggal 29–31 menyesuaikan
          akhir bulan. Biaya/bunga dicatat sebagai pengeluaran terpisah.
        </p>
      </div>
    </EditorDialog>
  );
}
function PaymentEditor({
  wallet,
  onClose,
}: {
  wallet: Wallet;
  onClose: () => void;
}) {
  const ledger = useLedger(),
    term = ledger.liabilities.find((t) => t.walletId === wallet.id),
    debt = Math.max(0, -(position(ledger).balances.get(wallet.id) ?? 0));
  const [source, setSource] = useState(
      term?.paymentWalletId ??
        ledger.wallets.find((w) => !isLiability(w) && !w.archived)?.id ??
        "",
    ),
    [amount, setAmount] = useState(
      Math.min(debt, term?.paymentAmount ?? debt).toLocaleString("id-ID"),
    ),
    [date, setDate] = useState(localDate());
  return (
    <EditorDialog
      title={`Bayar ${wallet.name}`}
      description="Pembayaran mengurangi saldo sumber dan utang. Pengeluaran tidak dihitung ulang."
      saveLabel="Catat pembayaran"
      onClose={onClose}
      onSave={() => {
        const at = new Date().toISOString();
        return db.saveEntity(
          "transfers",
          {
            id: crypto.randomUUID(),
            sourceWalletId: source,
            targetWalletId: wallet.id,
            amount: parseAmount(amount),
            date,
            note: `Pembayaran ${wallet.name}`,
            createdAt: at,
            updatedAt: at,
          },
          false,
        );
      }}
    >
      <div className="field">
        <label htmlFor="pay-from">Bayar dari</label>
        <SelectField
          id="pay-from"
          value={source}
          onValueChange={setSource}
          options={ledger.wallets
            .filter((w) => !isLiability(w) && !w.archived)
            .map((w) => ({ value: w.id, label: w.name }))}
        />
      </div>
      <AmountField value={amount} onChange={setAmount} />
      <div className="field">
        <label htmlFor="pay-date">Tanggal pembayaran</label>
        <DatePicker id="pay-date" value={date} onChange={setDate} />
      </div>
    </EditorDialog>
  );
}
export default function Liabilities() {
  const ledger = useLedger(),
    hidden = ledger.preferences.hideAmounts,
    [adding, setAdding] = useState(false),
    [terms, setTerms] = useState<Wallet | null>(null),
    [payment, setPayment] = useState<Wallet | null>(null),
    [detail, setDetail] = useState("");
  const summary = useMemo(
    () => position(ledger),
    [ledger.wallets, ledger.transactions, ledger.transfers],
  );
  const wallets = ledger.wallets.filter(isLiability),
    upcoming = calendarItems(
      ledger,
      localDate(),
      addDays(localDate(), 90),
    ).filter((i) => i.source === "liability");
  const wallet = wallets.find((w) => w.id === detail),
    term = ledger.liabilities.find((t) => t.walletId === detail);
  const cycle = term
    ? (() => {
        const now = new Date(localDate() + "T12:00:00");
        let close = new Date(
          now.getFullYear(),
          now.getMonth(),
          Math.min(
            term.statementDay,
            new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
          ),
          12,
        );
        if (localDate(close) < localDate())
          close = new Date(
            close.getFullYear(),
            close.getMonth() + 1,
            Math.min(
              term.statementDay,
              new Date(close.getFullYear(), close.getMonth() + 2, 0).getDate(),
            ),
            12,
          );
        const previous = new Date(
          close.getFullYear(),
          close.getMonth() - 1,
          Math.min(
            term.statementDay,
            new Date(close.getFullYear(), close.getMonth(), 0).getDate(),
          ),
          12,
        );
        return {
          start: addDays(localDate(previous), 1),
          end: localDate(close),
        };
      })()
    : null;
  return (
    <>
      <PageHeading
        eyebrow="ASET & KEWAJIBAN"
        title="Tagihan dalam kendali"
        description="Lihat sisa utang, siklus tagihan, dan rencana pembayaran tanpa menggandakan pengeluaran."
        action={
          <button className="button primary" onClick={() => setAdding(true)}>
            Tambah akun kewajiban
          </button>
        }
      />
      <section className="v3-statement">
        <span className="eyebrow">TOTAL KEWAJIBAN TERCATAT</span>
        <strong className="v3-major-number">
          {money(summary.debt, hidden)}
        </strong>
        <p>
          Posisi bersih {money(summary.netWorth, hidden)} dari aset{" "}
          {money(summary.assets, hidden)} dan kewajiban. Saldo mencakup seluruh
          catatan, termasuk tanggal mendatang.
        </p>
      </section>
      {!wallets.length ? (
        <div className="v3-empty">
          <h2>Mulai dari kewajiban yang ingin dipantau</h2>
          <p>
            Tambahkan kartu kredit, PayLater, atau pinjaman melalui jenis akun.
            Masukkan sisa utang sebagai utang awal.
          </p>
        </div>
      ) : (
        <div className="v3-register">
          {wallets.map((w) => {
            const balance = summary.balances.get(w.id) ?? 0,
              next = upcoming.find((i) => i.targetWalletId === w.id);
            return (
              <div className="v3-row liability-row" key={w.id}>
                <button
                  className="v3-text-button"
                  onClick={() => setDetail(detail === w.id ? "" : w.id)}
                >
                  <strong>{w.name}</strong>
                  <small>
                    {next
                      ? `Jatuh tempo ${dateLabel(next.date, ledger.preferences.dateFormat)}`
                      : "Atur jadwal pembayaran"}
                    {w.archived ? " · Arsip" : ""}
                  </small>
                </button>
                <strong>{money(-balance, hidden)}</strong>
                <div className="v3-actions">
                  <button
                    className="button secondary small-button"
                    onClick={() => setTerms(w)}
                  >
                    Atur tagihan
                  </button>
                  <button
                    className="button primary small-button"
                    disabled={w.archived}
                    onClick={() => setPayment(w)}
                  >
                    Bayar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {wallet && (
        <section className="v3-section">
          <h2>Aktivitas {wallet.name}</h2>
          {cycle && (
            <p>
              Siklus {dateLabel(cycle.start)}–{dateLabel(cycle.end)} · jatuh
              tempo tanggal {term!.dueDay}
            </p>
          )}
          <div className="v3-register">
            {ledger.transactions
              .filter(
                (t) =>
                  t.walletId === wallet.id &&
                  (!cycle || (t.date >= cycle.start && t.date <= cycle.end)),
              )
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 30)
              .map((t) => (
                <div className="v3-row" key={t.id}>
                  <div>
                    <strong>{t.note || "Pembelian"}</strong>
                    <small>{dateLabel(t.date)}</small>
                  </div>
                  <span>{money(t.amount, hidden)}</span>
                </div>
              ))}
          </div>
          <Link className="text-link" to={`/transaksi?wallet=${wallet.id}`}>
            Buka seluruh transaksi akun
          </Link>
        </section>
      )}
      {adding && (
        <WalletEditor defaultType="credit" onClose={() => setAdding(false)} />
      )}{" "}
      {terms && <TermsEditor wallet={terms} onClose={() => setTerms(null)} />}{" "}
      {payment && (
        <PaymentEditor wallet={payment} onClose={() => setPayment(null)} />
      )}{" "}
    </>
  );
}
