import { useRef, useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { ErrorNotice } from "./ui";
import { useNotify, useCanEdit } from "./LedgerProvider";
import { errorMessage } from "../domain/ledger";
export function EditorDialog({
  title,
  description,
  onClose,
  onSave,
  onDelete,
  children,
  saveLabel = "Simpan",
  success = "Perubahan tersimpan.",
}: {
  title: string;
  description: string;
  onClose: () => void;
  onSave: () => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  children: ReactNode;
  saveLabel?: string;
  success?: string;
}) {
  const notify = useNotify();
  const canEdit = useCanEdit();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  const lock = useRef(false);
  async function submit(remove = false) {
    if (!canEdit) {
      setError("Ruang ini hanya dapat dibaca.");
      return;
    }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await (remove ? onDelete!() : onSave());
      notify(remove ? "Catatan dihapus." : success);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      title={deleting ? "Hapus catatan ini?" : title}
      description={
        deleting
          ? "Tindakan ini tidak dapat dibatalkan. Perhitungan terkait akan diperbarui."
          : description
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(deleting);
        }}
        noValidate
      >
        <fieldset disabled={busy} className="editor-fields">
          {!deleting && children}
        </fieldset>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <div className="modal-footer">
          {onDelete && !deleting && (
            <button
              type="button"
              className="button text-danger delete-button"
              disabled={busy || !canEdit}
              onClick={() => setDeleting(true)}
            >
              Hapus
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => (deleting ? setDeleting(false) : onClose())}
          >
            {deleting ? "Kembali" : "Batal"}
          </button>
          <button
            type="submit"
            className={`button ${deleting ? "danger" : "primary"}`}
            disabled={busy || !canEdit}
          >
            {busy ? "Menyimpan…" : deleting ? "Ya, hapus" : saveLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
