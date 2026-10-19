import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useLedger } from "../../components/LedgerProvider";
import { db } from "../../data/database";
import { isLiability, position } from "../../domain/finance";
import { dateLabel, money, safeSum, type DateRange } from "../../domain/ledger";
export function FinancialPosition({
  range,
  walletId,
}: {
  range: DateRange;
  walletId: string;
}) {
  const ledger = useLedger(),
    hidden = ledger.preferences.hideAmounts;
  const summary = useMemo(() => {
    const assets = new Set(
      ledger.wallets
        .filter((w) => !isLiability(w) && (!walletId || w.id === walletId))
        .map((w) => w.id),
    );
    let incoming = 0,
      outgoing = 0;
    for (const t of ledger.transactions)
      if (
        assets.has(t.walletId) &&
        t.date >= range.start &&
        t.date <= range.end
      ) {
        if (t.kind === "income" || t.refund)
          incoming = safeSum([incoming, t.amount]);
        else outgoing = safeSum([outgoing, t.amount]);
      }
    for (const t of ledger.transfers)
      if (t.date >= range.start && t.date <= range.end) {
        if (assets.has(t.sourceWalletId) && !assets.has(t.targetWalletId))
          outgoing = safeSum([outgoing, t.amount]);
        if (!assets.has(t.sourceWalletId) && assets.has(t.targetWalletId))
          incoming = safeSum([incoming, t.amount]);
      }
    return { incoming, outgoing, position: position(ledger, range.end) };
  }, [
    ledger.wallets,
    ledger.transactions,
    ledger.transfers,
    range.start,
    range.end,
    walletId,
  ]);
  const audit = useLiveQuery(async () => {
    const query = db.journal
      .where("date")
      .between(range.start, range.end, true, true);
    return {
      count: await query.count(),
      rows: await query.reverse().limit(20).toArray(),
    };
  }, [range.start, range.end]);
  const name = (id: string) =>
    ledger.wallets.find((w) => w.id === id)?.name ??
    ledger.categories.find((c) => `category:${c.id}` === id)?.name ??
    "Saldo awal";
  return (
    <section className="v3-section financial-report">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ASET, KEWAJIBAN & DANA</span>
          <h2>Posisi keuangan dan arus kas nyata</h2>
          <p>
            Pembelian kredit masuk pengeluaran saat dibeli. Dana aset baru
            keluar saat tagihan dibayar.
          </p>
        </div>
      </div>
      <dl className="v3-financial-totals">
        <div>
          <dt>Aset seluruh akun sampai akhir periode</dt>
          <dd>{money(summary.position.assets, hidden)}</dd>
        </div>
        <div>
          <dt>Kewajiban seluruh akun sampai akhir periode</dt>
          <dd>{money(summary.position.debt, hidden)}</dd>
        </div>
        <div>
          <dt>Posisi bersih</dt>
          <dd>{money(summary.position.netWorth, hidden)}</dd>
        </div>
        <div>
          <dt>
            Dana aset masuk dalam periode{walletId ? " · akun pilihan" : ""}
          </dt>
          <dd>{money(summary.incoming, hidden)}</dd>
        </div>
        <div>
          <dt>
            Dana aset keluar dalam periode{walletId ? " · akun pilihan" : ""}
          </dt>
          <dd>{money(summary.outgoing, hidden)}</dd>
        </div>
      </dl>
      <p className="field-hint">
        Arus dana aset mencakup pencairan/pembayaran pinjaman dan refund.
        Transfer di antara akun dalam cakupan tidak dihitung sebagai arus dana
        gabungan. Refund mengurangi pengeluaran kategori pada ringkasan di atas.
      </p>
      <details>
        <summary>
          Telusuri dampak transaksi ·{" "}
          {audit?.count.toLocaleString("id-ID") ?? "…"} catatan
        </summary>
        <p className="field-hint">
          20 catatan terbaru dalam periode. Setiap catatan memiliki jumlah
          dampak nol agar perpindahan dan pengeluaran tetap konsisten.
        </p>
        <div className="v3-register">
          {audit?.rows.map((entry) => (
            <div className="v3-row" key={entry.id}>
              <div>
                <strong>{entry.note || "Transaksi"}</strong>
                <small>{dateLabel(entry.date)}</small>
              </div>
              <div>
                {entry.postings.map((posting, i) => (
                  <small key={i}>
                    {name(posting.accountId)}: {money(posting.amount, hidden)}
                  </small>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
