import { EditorDialog } from "../../components/EditorDialog";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Plus } from "lucide-react";
import { useLedger } from "../../components/LedgerProvider";
import { PageHeading } from "../../components/ui";
import {
  AmountField,
  PlanningTabs,
  ProgressMeter,
  WalletPicker,
} from "../../components/planning-ui";
import { db } from "../../data/database";
import { dateLabel, localDate, money, parseAmount } from "../../domain/ledger";
import type { SavingsGoal } from "../../domain/ledger";
import { walletBalances } from "../../domain/planning";
import { isLiability } from "../../domain/finance";

function GoalEditor({
  goal,
  onClose,
}: {
  goal?: SavingsGoal;
  onClose: () => void;
}) {
  const ledger = useLedger();
  const [id] = useState(() => goal?.id ?? crypto.randomUUID());
  const [name, setName] = useState(goal?.name ?? "");
  const [walletId, setWalletId] = useState(
    goal?.walletId ??
      ledger.wallets.find((w) => !w.archived && w.type === "savings")?.id ??
      ledger.wallets.find((w) => !w.archived && !isLiability(w))?.id ??
      "",
  );
  const [amount, setAmount] = useState(
    goal?.amount.toLocaleString("id-ID") ?? "",
  );
  const [date, setDate] = useState(goal?.targetDate ?? localDate());
  const [archived, setArchived] = useState(goal?.archived ?? false);
  return (
    <EditorDialog
      title={goal ? "Ubah target tabungan" : "Buat target tabungan"}
      description="Progres mengikuti saldo dompet yang dihubungkan. Satu dompet untuk satu target aktif agar dana tidak dihitung dua kali."
      onClose={onClose}
      saveLabel="Simpan target"
      onDelete={goal ? () => db.removeEntity("goals", goal) : undefined}
      onSave={() =>
        db.saveEntity(
          "goals",
          {
            id,
            name: name.trim(),
            walletId,
            amount: parseAmount(amount),
            targetDate: date,
            archived,
            updatedAt: goal?.updatedAt ?? new Date().toISOString(),
          },
          Boolean(goal),
        )
      }
    >
      <div className="field">
        <label htmlFor="goal-name">Nama target</label>
        <input
          id="goal-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="Misalnya, Dana darurat"
          autoFocus
        />
      </div>
      <WalletPicker
        label="Dompet tabungan"
        value={walletId}
        onChange={setWalletId}
        archivedId={goal?.walletId}
        assetOnly
      />
      <AmountField
        label="Jumlah yang ingin dicapai (Rp)"
        value={amount}
        onChange={setAmount}
      />
      <div className="field">
        <label htmlFor="goal-date">Tanggal target</label>
        <input
          id="goal-date"
          type="date"
          min="1900-01-01"
          max="9999-12-31"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {goal && (
        <label className="check-line">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Arsipkan target ini
        </label>
      )}
      <p className="field-hint">
        Gunakan dompet khusus untuk tiap tujuan. Transfer ke dompet tersebut
        akan memperbarui progres tanpa mencatat pengeluaran baru.
      </p>
    </EditorDialog>
  );
}
export default function Goals() {
  const ledger = useLedger();
  const [editor, setEditor] = useState<SavingsGoal | "new" | null>(null);
  const [archived, setArchived] = useState(false);
  const balances = useMemo(() => walletBalances(ledger), [ledger]);
  const goals = ledger.goals
    .filter((g) => g.archived === archived)
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  const hidden = ledger.preferences.hideAmounts;
  const names = new Map(ledger.wallets.map((w) => [w.id, w.name]));
  return (
    <>
      <PageHeading
        eyebrow="RENCANA KEUANGAN"
        title="Target tabungan"
        description="Hubungkan tujuanmu dengan uang yang benar-benar tersedia."
        action={
          <button className="button primary" onClick={() => setEditor("new")}>
            <Plus size={17} />
            Buat target
          </button>
        }
      />
      <PlanningTabs />
      <div className="plan-overview">
        <div>
          <h2>Tujuan yang sedang kamu bangun</h2>
          <p>Progres berubah bersama saldo dompet</p>
        </div>
        <div className="tabs">
          <button
            className={!archived ? "active" : ""}
            onClick={() => setArchived(false)}
            aria-pressed={!archived}
          >
            Aktif
          </button>
          <button
            className={archived ? "active" : ""}
            onClick={() => setArchived(true)}
            aria-pressed={archived}
          >
            Diarsipkan
          </button>
        </div>
      </div>
      <section className="surface goal-register">
        {goals.length ? (
          goals.map((g) => {
            const balance = Math.max(0, balances.get(g.walletId) ?? 0);
            const remaining = Math.max(0, g.amount - balance);
            const overdue = g.targetDate < localDate() && remaining > 0;
            return (
              <div className="goal-line" key={g.id}>
                <div className="budget-heading">
                  <div>
                    <h3>{g.name}</h3>
                    <p>
                      {names.get(g.walletId)} · target{" "}
                      {dateLabel(g.targetDate, ledger.preferences.dateFormat)}
                    </p>
                  </div>
                  <button
                    className="text-link"
                    aria-label={`Ubah target ${g.name}`}
                    onClick={() => setEditor(g)}
                  >
                    Ubah
                  </button>
                </div>
                <div className="goal-figures">
                  <strong>{money(balance, hidden)}</strong>
                  <span>dari {money(g.amount, hidden)}</span>
                </div>
                <ProgressMeter
                  label={`Progres ${g.name}`}
                  value={balance / g.amount}
                  hidden={hidden}
                />
                <div className="budget-foot">
                  <span>
                    {hidden
                      ? "Nominal disembunyikan"
                      : remaining === 0
                        ? "Target tercapai"
                        : overdue
                          ? "Tanggal target sudah lewat"
                          : `Masih perlu ${money(remaining)}`}
                  </span>
                  <Link className="text-link" to="/dompet">
                    Kelola dana <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <div className="quiet-empty planning-empty">
            <h2>
              {archived
                ? "Belum ada target arsip"
                : "Punya tujuan untuk uangmu?"}
            </h2>
            <p>
              Dana darurat, pendidikan, atau perjalanan. Mulai dengan dompet
              khusus dan nominal yang ingin dicapai.
            </p>
            {!archived && (
              <button
                className="button secondary"
                onClick={() => setEditor("new")}
              >
                Buat target pertama
              </button>
            )}
          </div>
        )}
      </section>
      <p className="page-footnote">
        Progres mencerminkan seluruh saldo dompet saat ini, termasuk saldo awal.
        Pengeluaran dari dompet tersebut akan menurunkan progres.
      </p>
      {editor && (
        <GoalEditor
          goal={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
