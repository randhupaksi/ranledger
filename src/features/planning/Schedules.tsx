import { EditorDialog } from "../../components/EditorDialog";
import { DatePicker } from "../../components/DatePicker";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useLedger, useNotify } from "../../components/LedgerProvider";
import { Modal } from "../../components/Modal";
import { PageHeading, ErrorNotice } from "../../components/ui";
import {
  AmountField,
  PlanningTabs,
  WalletPicker,
} from "../../components/planning-ui";
import { SelectField } from "../../components/SelectField";
import { db } from "../../data/database";
import {
  dateLabel,
  errorMessage,
  localDate,
  money,
  parseAmount,
} from "../../domain/ledger";
import type {
  Frequency,
  RecurringSchedule,
  TransactionKind,
} from "../../domain/ledger";

const frequencies: Record<Frequency, string> = {
  weekly: "Setiap minggu",
  monthly: "Setiap bulan",
  yearly: "Setiap tahun",
};
function ScheduleEditor({
  schedule,
  onClose,
}: {
  schedule?: RecurringSchedule;
  onClose: () => void;
}) {
  const ledger = useLedger();
  const [id] = useState(() => schedule?.id ?? crypto.randomUUID());
  const [name, setName] = useState(schedule?.name ?? "");
  const [kind, setKind] = useState<TransactionKind>(
    schedule?.kind ?? "expense",
  );
  const [categoryId, setCategoryId] = useState(
    schedule?.categoryId ??
      ledger.categories.find((c) => c.kind === "expense" && !c.archived)?.id ??
      "",
  );
  const [walletId, setWalletId] = useState(
    schedule?.walletId ?? ledger.wallets.find((w) => !w.archived)?.id ?? "",
  );
  const [amount, setAmount] = useState(
    schedule?.amount.toLocaleString("id-ID") ?? "",
  );
  const [frequency, setFrequency] = useState<Frequency>(
    schedule?.frequency ?? "monthly",
  );
  const [date, setDate] = useState(schedule?.nextDate ?? localDate());
  const [endDate, setEndDate] = useState(schedule?.endDate ?? "");
  const [active, setActive] = useState(schedule?.active ?? true);
  return (
    <EditorDialog
      title={schedule ? "Ubah transaksi rutin" : "Tambah transaksi rutin"}
      description="Jadwal mengingatkanmu saat membuka aplikasi. Catatan baru dibuat setelah kamu mengonfirmasi."
      onClose={onClose}
      saveLabel="Simpan jadwal"
      onDelete={
        schedule ? () => db.removeEntity("schedules", schedule) : undefined
      }
      onSave={() =>
        db.saveEntity(
          "schedules",
          {
            id,
            name: name.trim(),
            kind,
            categoryId,
            walletId,
            amount: parseAmount(amount),
            frequency,
            nextDate: date,
            anchorDate:
              schedule &&
              date === schedule.nextDate &&
              frequency === schedule.frequency
                ? schedule.anchorDate
                : date,
            endDate: endDate || null,
            active,
            updatedAt: schedule?.updatedAt ?? new Date().toISOString(),
          },
          Boolean(schedule),
        )
      }
    >
      <div className="field">
        <label htmlFor="schedule-name">Nama jadwal</label>
        <input
          id="schedule-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="Misalnya, Tagihan internet"
        />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="schedule-kind">Jenis transaksi rutin</label>
          <SelectField
            id="schedule-kind"
            value={kind}
            onValueChange={(v) => {
              setKind(v as TransactionKind);
              setCategoryId(
                ledger.categories.find((c) => c.kind === v && !c.archived)
                  ?.id ?? "",
              );
            }}
            options={[
              { value: "expense", label: "Pengeluaran" },
              { value: "income", label: "Pemasukan" },
            ]}
          />
        </div>
        <div className="field">
          <label htmlFor="schedule-category">Kategori jadwal</label>
          <SelectField
            id="schedule-category"
            value={categoryId}
            onValueChange={setCategoryId}
            options={ledger.categories
              .filter(
                (c) =>
                  c.kind === kind &&
                  (!c.archived || c.id === schedule?.categoryId),
              )
              .map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
      </div>
      <WalletPicker
        value={walletId}
        onChange={setWalletId}
        archivedId={schedule?.walletId}
      />
      <AmountField value={amount} onChange={setAmount} />
      <div className="field">
        <label htmlFor="schedule-frequency">Pengulangan</label>
        <SelectField
          id="schedule-frequency"
          value={frequency}
          onValueChange={(v) => setFrequency(v as Frequency)}
          options={Object.entries(frequencies).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="schedule-date">Jadwal berikutnya</label>
          <DatePicker
            id="schedule-date"
            min="1900-01-01"
            max="9999-12-31"
            value={date}
            onChange={setDate}
          />
        </div>
        <div className="field">
          <label htmlFor="schedule-end">Berakhir pada (opsional)</label>
          <DatePicker
            id="schedule-end"
            min={date}
            max="9999-12-31"
            value={endDate}
            onChange={setEndDate}
            clearable
            placeholder="Tidak ada batas akhir"
          />
        </div>
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Jadwal aktif
      </label>
      <p className="field-hint">
        Jadwal tanggal 29–31 memakai akhir bulan jika tanggalnya tidak tersedia,
        lalu kembali ke tanggal semula pada bulan berikutnya.
      </p>
    </EditorDialog>
  );
}
export default function Schedules() {
  const ledger = useLedger();
  const notify = useNotify();
  const [editor, setEditor] = useState<RecurringSchedule | "new" | null>(null);
  const [paused, setPaused] = useState(false);
  const [confirm, setConfirm] = useState<{
    schedule: RecurringSchedule;
    action: "record" | "skip";
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const today = localDate();
  const schedules = ledger.schedules
    .filter((s) => s.active !== paused)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const due = schedules.filter((s) => s.active && s.nextDate <= today).length;
  const hidden = ledger.preferences.hideAmounts;
  const wallets = new Map(ledger.wallets.map((w) => [w.id, w.name]));
  async function resolve() {
    if (!confirm || busy) return;
    setBusy(true);
    setError("");
    try {
      await db.resolveSchedule(confirm.schedule, confirm.action);
      notify(
        confirm.action === "record"
          ? "Transaksi rutin tercatat. Jadwal berikutnya diperbarui."
          : "Kejadian ini dilewati. Jadwal berikutnya diperbarui.",
      );
      setConfirm(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="RENCANA KEUANGAN"
        title="Transaksi rutin"
        description="Ingat tagihan dan pemasukan tetap tanpa mencatat dua kali."
        action={
          <button className="button primary" onClick={() => setEditor("new")}>
            <Plus size={17} />
            Tambah jadwal
          </button>
        }
      />
      <PlanningTabs />
      <div className="plan-overview">
        <div>
          <h2>
            {due
              ? `${due} jadwal perlu dikonfirmasi`
              : "Jadwalmu tersusun di sini"}
          </h2>
          <p>Jadwal tidak memengaruhi saldo sebelum dicatat</p>
        </div>
        <div className="tabs">
          <button
            className={!paused ? "active" : ""}
            onClick={() => setPaused(false)}
            aria-pressed={!paused}
          >
            Aktif
          </button>
          <button
            className={paused ? "active" : ""}
            onClick={() => setPaused(true)}
            aria-pressed={paused}
          >
            Dijeda / selesai
          </button>
        </div>
      </div>
      <section className="surface schedule-register">
        {schedules.length ? (
          schedules.map((s) => (
            <div
              className={`schedule-line ${s.active && s.nextDate <= today ? "is-due" : ""}`}
              key={s.id}
            >
              <div className="schedule-date">
                <strong>
                  {dateLabel(s.nextDate, ledger.preferences.dateFormat)}
                </strong>
                <span>
                  {!s.active
                    ? "Tidak aktif"
                    : s.nextDate < today
                      ? "Terlewat · perlu ditinjau"
                      : s.nextDate === today
                        ? "Jatuh tempo hari ini"
                        : "Mendatang"}
                </span>
              </div>
              <div className="schedule-info">
                <h3>{s.name}</h3>
                <p>
                  {frequencies[s.frequency]} · {wallets.get(s.walletId)} ·{" "}
                  {s.kind === "income" ? "Pemasukan" : "Pengeluaran"}
                </p>
                <strong
                  className={s.kind === "income" ? "income numeric" : "numeric"}
                >
                  {money(s.amount, hidden)}
                </strong>
              </div>
              <div className="row-actions">
                {s.active && s.nextDate <= today && (
                  <>
                    <button
                      className="button primary small-button"
                      onClick={() => {
                        setError("");
                        setConfirm({ schedule: s, action: "record" });
                      }}
                    >
                      Catat
                    </button>
                    <button
                      className="text-link muted"
                      onClick={() => {
                        setError("");
                        setConfirm({ schedule: s, action: "skip" });
                      }}
                    >
                      Lewati
                    </button>
                  </>
                )}
                <button
                  className="text-link"
                  aria-label={`Ubah jadwal ${s.name}`}
                  onClick={() => setEditor(s)}
                >
                  Ubah
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="quiet-empty planning-empty">
            <h2>
              {paused
                ? "Tidak ada jadwal yang dijeda"
                : "Mulai dari tagihan yang rutin"}
            </h2>
            <p>
              Gaji, internet, sewa, atau langganan. Kamu tetap memutuskan kapan
              catatannya masuk.
            </p>
            {!paused && (
              <button
                className="button secondary"
                onClick={() => setEditor("new")}
              >
                Buat jadwal pertama
              </button>
            )}
          </div>
        )}
      </section>
      <p className="page-footnote">
        Pengingat muncul di aplikasi. Jika beberapa periode terlewat, konfirmasi
        atau lewati satu per satu. Menghapus jadwal tidak menghapus transaksi
        yang sudah tercatat.
      </p>
      {editor && (
        <ScheduleEditor
          schedule={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        busy={busy}
        title={
          confirm?.action === "skip"
            ? "Lewati jadwal ini?"
            : "Catat transaksi rutin?"
        }
        description={
          confirm?.action === "skip"
            ? "Kejadian ini tidak dibuat menjadi transaksi. Jadwal maju ke periode berikutnya."
            : "Transaksi memakai tanggal jatuh tempo berikut. Kamu dapat mengubahnya dari daftar transaksi setelah tersimpan."
        }
      >
        {confirm && (
          <div className="delete-summary">
            <strong>{confirm.schedule.name}</strong>
            <span>
              {dateLabel(confirm.schedule.nextDate)} ·{" "}
              {money(confirm.schedule.amount, hidden)}
            </span>
          </div>
        )}
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <div className="modal-footer">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setConfirm(null)}
          >
            Batal
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void resolve()}
          >
            {busy
              ? "Memproses…"
              : confirm?.action === "skip"
                ? "Ya, lewati"
                : "Konfirmasi & catat"}
          </button>
        </div>
      </Modal>
    </>
  );
}
