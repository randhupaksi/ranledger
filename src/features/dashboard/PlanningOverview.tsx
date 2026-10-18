import { useMemo } from "react";
import { Link } from "react-router";
import { useLedger } from "../../components/LedgerProvider";
import { ProgressMeter } from "../../components/planning-ui";
import { dateLabel, localDate, money } from "../../domain/ledger";
import { budgetProgresses, walletBalances } from "../../domain/planning";

export default function PlanningOverview() {
  const ledger = useLedger();
  const month = localDate().slice(0, 7),
    hidden = ledger.preferences.hideAmounts;
  const budgets = useMemo(
    () => ledger.budgets.filter((b) => b.month === month),
    [ledger.budgets, month],
  );
  const progress = useMemo(
    () => budgetProgresses(budgets, ledger),
    [budgets, ledger.transactions],
  );
  const upcoming = useMemo(
    () =>
      ledger.schedules
        .filter((s) => s.active)
        .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
        .slice(0, 3),
    [ledger.schedules],
  );
  const balances = useMemo(() => walletBalances(ledger), [ledger]);
  const goals = ledger.goals.filter((g) => !g.archived).slice(0, 2);
  const categoryNames = new Map(ledger.categories.map((c) => [c.id, c.name]));
  return (
    <>
      <div className="wallet-inline" aria-label="Saldo per dompet">
        {ledger.wallets
          .filter((w) => !w.archived)
          .slice(0, 4)
          .map((w) => (
            <Link key={w.id} to={`/transaksi?wallet=${w.id}&period=all`}>
              <span>{w.name}</span>
              <strong>{money(balances.get(w.id) ?? 0, hidden)}</strong>
            </Link>
          ))}
        <Link to="/dompet" className="text-link">
          Kelola dompet →
        </Link>
      </div>
      <section className="surface planning-overview">
        <div className="planning-overview-column">
          <div className="section-heading">
            <div>
              <h2>Jaga pengeluaran bulan ini</h2>
              <p>Anggaran per kategori</p>
            </div>
            <Link className="text-link" to="/anggaran">
              Atur →
            </Link>
          </div>
          {budgets.length ? (
            [...budgets]
              .sort(
                (a, b) => progress.get(b.id)!.ratio - progress.get(a.id)!.ratio,
              )
              .slice(0, 3)
              .map((b) => {
                const p = progress.get(b.id)!;
                return (
                  <Link
                    className="brief-budget"
                    key={b.id}
                    to={`/anggaran?month=${month}`}
                  >
                    <div>
                      <strong>{categoryNames.get(b.categoryId)}</strong>
                      <span>
                        {b.walletId
                          ? ledger.wallets.find((w) => w.id === b.walletId)
                              ?.name
                          : "Semua dompet"}
                      </span>
                    </div>
                    <ProgressMeter
                      label={`Anggaran ${categoryNames.get(b.categoryId)}`}
                      value={p.ratio}
                      warning={p.status !== "normal"}
                      hidden={hidden}
                    />
                    <small>
                      {hidden
                        ? "Nominal disembunyikan"
                        : p.remaining < 0
                          ? `Lebih ${money(-p.remaining)}`
                          : `Sisa ${money(p.remaining)}`}
                    </small>
                  </Link>
                );
              })
          ) : (
            <div className="brief-empty">
              <p>Belum ada batas pengeluaran.</p>
              <span>Mulai dari satu kategori yang ingin kamu kendalikan.</span>
              <Link className="text-link" to="/anggaran">
                Buat anggaran pertama →
              </Link>
            </div>
          )}
        </div>
        <div className="planning-overview-column">
          <div className="section-heading">
            <div>
              <h2>Yang perlu kamu ingat</h2>
              <p>Tagihan dan pemasukan rutin</p>
            </div>
            <Link className="text-link" to="/rencana">
              Lihat →
            </Link>
          </div>
          {upcoming.length ? (
            upcoming.map((s) => (
              <Link className="brief-schedule" key={s.id} to="/rencana">
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {dateLabel(s.nextDate)}
                    {s.nextDate <= localDate() ? " · Perlu konfirmasi" : ""}
                  </small>
                </div>
                <span className="numeric">{money(s.amount, hidden)}</span>
              </Link>
            ))
          ) : (
            <div className="brief-empty">
              <p>Tidak ada jadwal rutin.</p>
              <span>Susun gaji, tagihan, atau langgananmu di sini.</span>
              <Link className="text-link" to="/rencana">
                Tambah jadwal →
              </Link>
            </div>
          )}
        </div>
      </section>
      {goals.length > 0 && (
        <section className="goal-brief">
          <div>
            <h2>Tujuan tabungan</h2>
            <Link className="text-link" to="/rencana/tujuan">
              Semua target →
            </Link>
          </div>
          {goals.map((g) => (
            <Link to="/rencana/tujuan" className="goal-brief-row" key={g.id}>
              <strong>{g.name}</strong>
              <ProgressMeter
                value={Math.max(0, balances.get(g.walletId) ?? 0) / g.amount}
                label={`Progres ${g.name}`}
                hidden={hidden}
              />
              <span>
                {money(Math.max(0, balances.get(g.walletId) ?? 0), hidden)}{" "}
                <small>/ {money(g.amount, hidden)}</small>
              </span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
