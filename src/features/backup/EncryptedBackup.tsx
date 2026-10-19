import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Modal } from "../../components/Modal";
import { ErrorNotice } from "../../components/ui";
import { useNotify } from "../../components/LedgerProvider";
import { createBackup, downloadFile, type Backup } from "../../data/backup";
import { decryptBackup, encryptBackup } from "../../data/encrypted-backup";
import { db } from "../../data/database";
import { errorMessage, localDate } from "../../domain/ledger";
export function EncryptedBackup({
  onRestore,
}: {
  onRestore: (backup: Backup, name: string) => Promise<void>;
}) {
  const notify = useNotify(),
    input = useRef<HTMLInputElement>(null);
  const checkpoint = useLiveQuery(() => db.syncState.get("preV3Backup"));
  const [open, setOpen] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [pass, setPass] = useState(""),
    [repeat, setRepeat] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function close() {
    if (busy) return;
    setOpen(false);
    setFile(null);
    setPass("");
    setRepeat("");
    setError("");
  }
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (file) {
        if (file.size > 256 * 1024 * 1024)
          throw new Error("Backup terenkripsi maksimal 256 MB.");
        await onRestore(
          await decryptBackup(await file.text(), pass),
          file.name,
        );
      } else {
        if (pass !== repeat)
          throw new Error("Konfirmasi frasa sandi belum sama.");
        const backup = createBackup(await db.snapshot());
        const text = await encryptBackup(backup, pass);
        downloadFile(
          text,
          `ranledger-${localDate()}.rledger`,
          "application/json",
        );
        await db.updatePreferences({ lastBackupAt: backup.exportedAt });
        notify("Backup terenkripsi dibuat dan pemulihannya diperiksa.");
      }
      setOpen(false);
      setFile(null);
      setPass("");
      setRepeat("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="v3-section">
      {checkpoint && (
        <div className="notice">
          <p>
            Salinan sebelum upgrade v3 tersedia. Salinan ini belum memuat
            catatan yang dibuat setelah upgrade.
          </p>
          <button
            className="button secondary small-button"
            onClick={() =>
              downloadFile(
                JSON.stringify(checkpoint.value, null, 2),
                "ranledger-sebelum-v3.json",
                "application/json",
              )
            }
          >
            Unduh salinan sebelum v3
          </button>
        </div>
      )}
      <div className="section-heading">
        <div>
          <h2>Backup dengan frasa sandi</h2>
          <p>
            File dienkripsi di perangkat ini. Simpan frasa sandi terpisah; frasa
            sandi tidak dapat dipulihkan server.
          </p>
        </div>
        <div className="v3-actions">
          <button
            className="button secondary"
            onClick={() => {
              setFile(null);
              setOpen(true);
            }}
          >
            Unduh backup terenkripsi
          </button>
          <button
            className="button secondary"
            onClick={() => input.current?.click()}
          >
            Buka backup terenkripsi
          </button>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept=".rledger"
        className="sr-only"
        aria-label="Pilih backup terenkripsi"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
            setOpen(true);
          }
          e.target.value = "";
        }}
      />
      {open && (
        <Modal
          open
          onClose={close}
          busy={busy}
          title={
            file
              ? "Buka backup terenkripsi"
              : "Lindungi backup dengan frasa sandi"
          }
          description={
            file
              ? file.name
              : "Gunakan minimal 12 karakter. Pemulihan diperiksa sebelum file diunduh."
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="field">
              <label htmlFor="backup-passphrase">Frasa sandi backup</label>
              <input
                id="backup-passphrase"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder={
                  file
                    ? "Masukkan frasa sandi untuk membuka backup"
                    : "Buat frasa sandi, minimal 12 karakter"
                }
                minLength={12}
                required
                autoComplete={file ? "off" : "new-password"}
              />
            </div>
            {!file && (
              <div className="field">
                <label htmlFor="backup-passphrase-repeat">
                  Ulangi frasa sandi
                </label>
                <input
                  id="backup-passphrase-repeat"
                  type="password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  placeholder="Ulangi frasa sandi backup"
                  minLength={12}
                  required
                  autoComplete="new-password"
                />
              </div>
            )}
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <div className="modal-footer">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={close}
              >
                Batal
              </button>
              <button className="button primary" disabled={busy}>
                {busy
                  ? "Memproses…"
                  : file
                    ? "Buka & periksa"
                    : "Enkripsi & unduh"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
