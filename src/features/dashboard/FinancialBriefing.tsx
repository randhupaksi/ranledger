import { useMemo } from "react";
import { Link } from "react-router";
import { useLedger } from "../../components/LedgerProvider";
import { position } from "../../domain/finance";
import { forecast } from "../../domain/forecast";
import { money } from "../../domain/ledger";
export function FinancialBriefing() {
  const ledger = useLedger(),
    hidden = ledger.preferences.hideAmounts;
  const financial = useMemo(
    () => position(ledger),
    [ledger.wallets, ledger.transactions, ledger.transfers],
  );
  const future = useMemo(
    () => forecast(ledger, 30),
    [
      ledger.wallets,
      ledger.transactions,
      ledger.transfers,
      ledger.schedules,
      ledger.liabilities,
    ],
  );
  return (
    <section
      className="financial-briefing"
      aria-label="Posisi dan rencana keuangan"
    >
      <div>
        <span className="eyebrow">ASET & KEWAJIBAN</span>
        <p>
          Aset <strong>{money(financial.assets, hidden)}</strong>
          <span className="brief-separator">/</span>Kewajiban{" "}
          <strong>{money(financial.debt, hidden)}</strong>
        </p>
        <Link to="/kewajiban" className="text-link">
          Kelola tagihan dan cicilan
        </Link>
      </div>
      <div>
        <span className="eyebrow">30 HARI KE DEPAN</span>
        <p>
          Dana aset diproyeksikan{" "}
          <strong>{money(future.endBalance, hidden)}</strong>
        </p>
        <Link to="/kalender" className="text-link">
          {future.low
            ? "Periksa proyeksi saldo negatif"
            : "Buka kalender & simulasi"}
        </Link>
      </div>
    </section>
  );
}
