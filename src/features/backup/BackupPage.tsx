import { Modal } from "../../components/Modal";
import { useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  FileJson,
  FileSpreadsheet,
  HardDrive,
  Info,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useLedger, useNotify } from "../../components/LedgerProvider";
import { ErrorNotice, PageHeading } from "../../components/ui";
import {
  backupToExcel,
  createBackup,
  downloadFile,
  exampleBackup,
  excelToBackup,
  makeImportPlan,
  parseBackup,
  readBackupFile,
} from "../../data/backup";
import type { Backup, ImportMode } from "../../data/backup";
import { db } from "../../data/database";
import {
  dateLabel,
  emptyLedger,
  errorMessage,
  localDate,
  money,
} from "../../domain/ledger";
import type { Ledger } from "../../domain/ledger";
import { ledgerTotals } from "../../domain/planning";
import { EncryptedBackup } from "./EncryptedBackup";

interface Preview {
  backup: Backup;
  current: Ledger;
  filename: string;
}
export default function BackupPage() {
  const ledger = useLedger();
  const notify = useNotify();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [confirm, setConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [testResult, setTestResult] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [dragging, setDragging] = useState(false);
  const planResult = useMemo(() => {
    if (!preview) return null;
    try {
      return {
        plan: makeImportPlan(preview.current, preview.backup, mode),
        error: "",
      };
    } catch (e) {
      return { plan: null, error: errorMessage(e) };
    }
  }, [preview, mode]);
  const stale = Boolean(
    preview && ledger.revision !== preview.current.revision,
  );
  async function exportBackup(format: "json" | "xlsx") {
    if (lock.current) return;
    lock.current = true;
    setBusy(format);
    setError("");
    try {
      const current = await db.snapshot();
      const backup = createBackup(current);
      if (format === "json")
        downloadFile(
          JSON.stringify(backup, null, 2),
          `ranledger-backup-${localDate()}.json`,
          "application/json",
        );
      else
        downloadFile(
          await backupToExcel(backup),
          `ranledger-backup-${localDate()}.xlsx`,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
      await db.updatePreferences({ lastBackupAt: backup.exportedAt });
      if (preview) setPreview({ ...preview, current: await db.snapshot() });
      notify(
        "File backup dibuat. Simpan salinannya di lokasi lain yang kamu percaya.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function selectFile(file?: File) {
    if (!file || lock.current) return;
    lock.current = true;
    setBusy("read");
    setError("");
    setPreview(null);
    setConfirmText("");
    try {
      const backup = await readBackupFile(file);
      setPreview({ backup, current: await db.snapshot(), filename: file.name });
      setMode("merge");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function restore() {
    if (
      !preview ||
      lock.current ||
      stale ||
      (mode === "replace" && confirmText !== "GANTI")
    )
      return;
    lock.current = true;
    setBusy("restore");
    setError("");
    try {
      const result = await db.restore(
        preview.backup,
        mode,
        preview.current.revision,
      );
      setConfirm(false);
      setPreview(null);
      setConfirmText("");
      notify(
        `Pemulihan diperiksa dan selesai. ${result.added} transaksi ${mode === "merge" ? "ditambahkan" : "dipulihkan"}${mode === "merge" && result.duplicates ? `, ${result.duplicates} ID yang sudah ada dilewati` : ""}.`,
      );
    } catch (e) {
      setError(errorMessage(e));
      setConfirm(false);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function testRecovery() {
    if (lock.current) return;
    lock.current = true;
    setBusy("test");
    setError("");
    setTestResult("");
    try {
      const sample = exampleBackup();
      const json = parseBackup(JSON.parse(JSON.stringify(sample)));
      const excel = await excelToBackup(await backupToExcel(sample));
      const a = makeImportPlan(emptyLedger(), json, "replace");
      const b = makeImportPlan(emptyLedger(), excel, "replace");
      if (
        JSON.stringify(a.ledger.transactions) !==
          JSON.stringify(b.ledger.transactions) ||
        JSON.stringify(a.ledger.categories) !==
          JSON.stringify(b.ledger.categories) ||
        JSON.stringify(a.ledger.preferences) !==
          JSON.stringify(b.ledger.preferences)
      )
        throw new Error("Hasil uji pemulihan tidak sama.");
      setTestResult(
        `Berhasil: 3 transaksi contoh pulih identik melalui JSON dan Excel, dengan saldo Rp2.915.000. Uji berjalan terpisah; catatanmu tidak berubah.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  const hidden = ledger.preferences.hideAmounts;
  const dates = preview?.backup.transactions.map((t) => t.date).sort() ?? [];
  return (
    <>
      <PageHeading
        eyebrow="JAGA CATATANMU"
        title="Backup & pemulihan"
        description="Simpan salinan. Bawa catatanmu saat pindah perangkat."
      />
      <div className="privacy-banner">
        <div className="privacy-banner-icon">
          <ShieldCheck size={26} />
        </div>
        <div>
          <h2>Privat di perangkatmu. Aman dengan salinanmu</h2>
          <p>
            Catatan tidak tersinkron otomatis. Membersihkan data browser, mode
            privat, atau kehilangan perangkat bisa menghapusnya. Simpan backup
            di folder atau penyimpanan pilihanmu.
          </p>
        </div>
      </div>
      <div className="backup-overview">
        <span>
          <HardDrive size={17} />
          {ledger.transactions.length.toLocaleString("id-ID")} transaksi ·{" "}
          {ledger.categories.length} kategori
        </span>
        <span>
          File terakhir dibuat:{" "}
          <strong>
            {ledger.preferences.lastBackupAt
              ? new Date(ledger.preferences.lastBackupAt).toLocaleString(
                  "id-ID",
                  { dateStyle: "medium", timeStyle: "short" },
                )
              : "Belum pernah"}
          </strong>
        </span>
      </div>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <EncryptedBackup
        onRestore={async (backup, filename) => {
          setPreview({ backup, filename, current: await db.snapshot() });
          setMode("merge");
          setConfirmText("");
        }}
      />
      <section className="surface backup-export">
        <div className="section-heading">
          <div>
            <h2>Buat backup lengkap</h2>
            <p>
              Seluruh transaksi, dompet, transfer, anggaran, jadwal, target,
              kategori, dan preferensi. Tidak mengikuti filter layar.
            </p>
          </div>
        </div>
        <div className="backup-formats">
          <div className="backup-format">
            <FileJson size={27} />
            <span className="recommended">Disarankan</span>
            <h3>Backup JSON</h3>
            <p>
              Salinan lengkap untuk pemulihan. Pilihan utama saat memindahkan
              atau menyimpan catatan.
            </p>
            <button
              className="button primary"
              disabled={Boolean(busy)}
              onClick={() => void exportBackup("json")}
            >
              <ArrowDownToLine size={17} />
              {busy === "json" ? "Menyiapkan…" : "Unduh JSON"}
            </button>
          </div>
          <div className="backup-format">
            <FileSpreadsheet size={27} />
            <h3>Backup Excel</h3>
            <p>
              Bisa dibaca di Excel dan dipulihkan ke Ranledger. Jaga nama
              lembar, kolom, dan ID tetap utuh.
            </p>
            <button
              className="button secondary"
              disabled={Boolean(busy)}
              onClick={() => void exportBackup("xlsx")}
            >
              <ArrowDownToLine size={17} />
              {busy === "xlsx" ? "Menyiapkan…" : "Unduh Excel"}
            </button>
          </div>
        </div>
        <p className="inline-help">
          <Info size={16} />
          File dibuat di perangkat ini. Tanggal ekspor bukan jaminan file masih
          tersimpan. Ekspor laporan tersedia di halaman Transaksi dan Laporan.
        </p>
      </section>
      <section className="surface backup-import">
        <div className="section-heading">
          <div>
            <h2>Pulihkan dari backup</h2>
            <p>
              File diperiksa dulu. Kamu bisa melihat dampaknya sebelum
              melanjutkan.
            </p>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.xlsx"
          className="sr-only"
          aria-label="Pilih file backup"
          onChange={(e) => void selectFile(e.target.files?.[0])}
          disabled={Boolean(busy)}
        />
        <button
          className={`upload-zone ${dragging ? "dragging" : ""}`}
          disabled={Boolean(busy)}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!busy) void selectFile(e.dataTransfer.files[0]);
          }}
        >
          <Upload size={27} />
          <strong>
            {busy === "read"
              ? "Memeriksa file…"
              : "Pilih atau letakkan file backup di sini"}
          </strong>
          <span>JSON hingga 256 MB · XLSX hingga 32 MB</span>
        </button>
        {preview && (
          <div className="import-preview">
            <div className="preview-title">
              <span className="verified">
                <Check size={17} />
                Format file valid
              </span>
              <strong>{preview.filename}</strong>
              <span>
                Dibuat{" "}
                {new Date(preview.backup.exportedAt).toLocaleString("id-ID")}
              </span>
            </div>
            <div className="preview-stats">
              <div>
                <span>Transaksi di file</span>
                <strong>
                  {preview.backup.transactions.length.toLocaleString("id-ID")}
                </strong>
              </div>
              <div>
                <span>Kategori</span>
                <strong>{preview.backup.categories.length}</strong>
              </div>
              <div>
                <span>Saldo dalam backup</span>
                <strong>
                  {money(ledgerTotals(preview.backup).balance, hidden)}
                </strong>
              </div>
            </div>
            <p className="muted small">
              Periode:{" "}
              {dates.length
                ? `${dateLabel(dates[0])} – ${dateLabel(dates[dates.length - 1])}`
                : "Belum ada transaksi"}
              .
            </p>
            <fieldset className="import-options" disabled={Boolean(busy)}>
              <legend>Cara memulihkan</legend>
              <label className={mode === "merge" ? "selected" : ""}>
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                />
                <span>
                  <strong>Gabungkan catatan</strong>
                  <small>
                    Tambahkan ID baru. ID yang sudah ada memakai catatan lokal,
                    termasuk jika isinya berbeda. Saldo awal dan preferensi
                    dompet dan preferensi lokal dipertahankan. Dompet baru
                    membawa saldo awalnya; anggaran atau target yang bertabrakan
                    memakai versi lokal.
                  </small>
                </span>
              </label>
              <label className={mode === "replace" ? "selected" : ""}>
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                />
                <span>
                  <strong>Ganti semua data</strong>
                  <small>
                    Seluruh transaksi, dompet, transfer, anggaran, jadwal,
                    target, kategori, dan preferensi lokal diganti dengan isi
                    file. Buat backup lokal lebih dulu.
                  </small>
                </span>
              </label>
            </fieldset>
            {planResult?.error && <ErrorNotice>{planResult.error}</ErrorNotice>}
            {planResult?.plan && (
              <div className="notice">
                <strong>
                  {planResult.plan.added} transaksi{" "}
                  {mode === "merge" ? "akan ditambahkan" : "akan dipulihkan"}.
                </strong>
                {mode === "merge" && (
                  <p>
                    {planResult.plan.duplicates} ID yang sudah ada dilewati;{" "}
                    {planResult.plan.conflicts} di antaranya berisi perubahan
                    berbeda. Versi lokal dipertahankan. Catatan dengan isi sama
                    tetapi ID berbeda tetap dianggap transaksi terpisah.
                  </p>
                )}
                <p>
                  Saldo setelah pemulihan:{" "}
                  <strong>
                    {money(
                      ledgerTotals(planResult.plan.ledger).balance,
                      hidden,
                    )}
                  </strong>
                  .
                </p>
                <p>
                  {planResult.plan.features.wallets} dompet ·{" "}
                  {planResult.plan.features.transfers} transfer ·{" "}
                  {planResult.plan.features.budgets} anggaran ·{" "}
                  {planResult.plan.features.schedules} jadwal ·{" "}
                  {planResult.plan.features.goals} target{" "}
                  {mode === "merge"
                    ? "baru akan ditambahkan"
                    : "akan dipulihkan"}
                  .
                </p>
              </div>
            )}
            {stale && (
              <div className="notice notice-warning">
                <p>
                  Data lokal berubah sejak file diperiksa. Perbarui pratinjau
                  sebelum melanjutkan.
                </p>
                <button
                  className="text-link"
                  onClick={() =>
                    void db
                      .snapshot()
                      .then((current) => setPreview({ ...preview, current }))
                      .catch((e) => setError(errorMessage(e)))
                  }
                >
                  Perbarui pratinjau
                </button>
              </div>
            )}
            <div className="preview-actions">
              <button
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() => void exportBackup("json")}
              >
                Backup lokal dulu
              </button>
              <button
                className="button primary"
                disabled={Boolean(busy) || stale || !planResult?.plan}
                onClick={() => {
                  setConfirmText("");
                  setConfirm(true);
                }}
              >
                Lanjutkan pemulihan <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="recovery-test">
        <div>
          <h2>Coba pemulihan tanpa risiko</h2>
          <p>
            Uji contoh 3 transaksi melalui JSON dan Excel di ruang uji terpisah.
            Catatan asli tidak disentuh.
          </p>
        </div>
        <div className="button-group">
          <button
            className="button secondary"
            disabled={Boolean(busy)}
            onClick={() =>
              downloadFile(
                JSON.stringify(exampleBackup(), null, 2),
                "ranledger-contoh.json",
                "application/json",
              )
            }
          >
            Unduh contoh
          </button>
          <button
            className="button secondary"
            disabled={Boolean(busy)}
            onClick={() => void testRecovery()}
          >
            {busy === "test" ? "Menguji…" : "Uji pemulihan contoh"}
          </button>
        </div>
        {testResult && (
          <p className="test-success" role="status">
            <Check size={18} />
            {testResult}
          </p>
        )}
      </section>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        busy={busy === "restore"}
        title={
          mode === "replace"
            ? "Ganti seluruh data di browser ini?"
            : "Gabungkan catatan dari backup?"
        }
        description={
          mode === "replace"
            ? `${ledger.transactions.length} transaksi lokal akan diganti. Perubahan ini hanya bisa dipulihkan dari backup yang kamu simpan.`
            : "ID yang sudah ada memakai versi lokal. Dompet baru membawa saldo awalnya. Preferensi lokal dipertahankan."
        }
      >
        {mode === "replace" && (
          <div className="field">
            <label htmlFor="confirm-replace">
              Ketik GANTI untuk melanjutkan
            </label>
            <input
              id="confirm-replace"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}
        {stale && (
          <ErrorNotice>
            Data berubah. Tutup dialog dan perbarui pratinjau.
          </ErrorNotice>
        )}
        <div className="modal-footer">
          <button
            className="button secondary"
            disabled={Boolean(busy)}
            onClick={() => setConfirm(false)}
          >
            Batal
          </button>
          <button
            className={`button ${mode === "replace" ? "danger" : "primary"}`}
            disabled={
              Boolean(busy) ||
              stale ||
              (mode === "replace" && confirmText !== "GANTI")
            }
            onClick={() => void restore()}
          >
            {busy === "restore"
              ? "Memulihkan…"
              : mode === "replace"
                ? "Ganti & pulihkan"
                : "Gabungkan sekarang"}
          </button>
        </div>
      </Modal>
    </>
  );
}
