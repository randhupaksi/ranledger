import { EditorDialog } from "../../components/EditorDialog";
import { Modal } from "../../components/Modal";
import { DatePicker } from "../../components/DatePicker";
import { useMemo, useState } from "react";
import { Archive, ArrowLeftRight, ArrowRight, Plus } from "lucide-react";
import { Link } from "react-router";
import { useLedger, useNotify } from "../../components/LedgerProvider";
import {
  EmptyState,
  ErrorNotice,
  PageHeading,
  Pagination,
} from "../../components/ui";
import { AmountField, WalletPicker } from "../../components/planning-ui";
import { SelectField } from "../../components/SelectField";
import { db } from "../../data/database";
import {
  dateLabel,
  errorMessage,
  localDate,
  money,
  parseAmount,
  walletTypes,
} from "../../domain/ledger";
import type { Transfer, Wallet, WalletType } from "../../domain/ledger";
import { ledgerTotals, walletBalances } from "../../domain/planning";
import { isLiability } from "../../domain/finance";

export function WalletEditor({
  wallet,
  onClose,
  defaultType = "bank",
}: {
  wallet?: Wallet;
  onClose: () => void;
  defaultType?: WalletType;
}) {
  const ledger = useLedger();
  const notify = useNotify();
  const [id] = useState(() => wallet?.id ?? crypto.randomUUID());
  const [name, setName] = useState(wallet?.name ?? "");
  const [type, setType] = useState<WalletType>(wallet?.type ?? defaultType);
  const [amount, setAmount] = useState(
    wallet
      ? (isLiability(wallet)
          ? -wallet.openingBalance
          : wallet.openingBalance
        ).toLocaleString("id-ID")
      : "0",
  );
  const [archived, setArchived] = useState(wallet?.archived ?? false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleteRevision, setDeleteRevision] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const walletInUse = Boolean(
    wallet &&
    (ledger.transactions.some((row) => row.walletId === wallet.id) ||
      ledger.transfers.some(
        (row) =>
          row.sourceWalletId === wallet.id || row.targetWalletId === wallet.id,
      ) ||
      ledger.budgets.some((row) => row.walletId === wallet.id) ||
      ledger.schedules.some((row) => row.walletId === wallet.id) ||
      ledger.goals.some((row) => row.walletId === wallet.id) ||
      ledger.liabilities.some(
        (row) =>
          row.walletId === wallet.id || row.paymentWalletId === wallet.id,
      )),
  );
  const isLastActiveWallet = Boolean(
    wallet &&
    !wallet.archived &&
    !ledger.wallets.some((row) => row.id !== wallet.id && !row.archived),
  );
  const ledgerChanged =
    deleteRevision !== null && deleteRevision !== ledger.revision;

  async function removeWallet() {
    if (
      !wallet ||
      deleteBusy ||
      deleteText !== "HAPUS" ||
      deleteRevision === null ||
      walletInUse ||
      isLastActiveWallet ||
      ledgerChanged
    )
      return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await db.removeWallet(wallet, deleteRevision);
      setDeleteOpen(false);
      notify(`Dompet ${wallet.name} dihapus.`);
      onClose();
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <EditorDialog
        title={wallet ? "Ubah dompet" : "Tambah dompet"}
        description="Saldo awal adalah uang yang sudah ada sebelum transaksi pertama dompet ini."
        onClose={onClose}
        saveLabel="Simpan dompet"
        onSave={() =>
          db.saveEntity(
            "wallets",
            {
              id,
              name: name.trim(),
              type,
              openingBalance: isLiability({ type })
                ? -Math.abs(parseAmount(amount, true))
                : parseAmount(amount, true),
              archived,
              updatedAt: wallet?.updatedAt ?? new Date().toISOString(),
            },
            Boolean(wallet),
          )
        }
      >
        <div className="field">
          <label htmlFor="wallet-name">Nama dompet</label>
          <input
            id="wallet-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Misalnya, Rekening utama"
          />
        </div>
        <div className="field">
          <label htmlFor="wallet-type">Jenis dompet</label>
          <SelectField
            id="wallet-type"
            value={type}
            onValueChange={(v) => setType(v as WalletType)}
            options={Object.entries(walletTypes).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </div>
        <AmountField
          label={
            isLiability({ type }) ? "Utang awal (Rp)" : "Saldo awal dompet (Rp)"
          }
          value={amount}
          onChange={setAmount}
          negative
        />
        <p className="field-hint">
          {isLiability({ type })
            ? "Masukkan sisa utang sebagai angka positif. Pembelian dicatat sebagai pengeluaran dari akun ini; pembayaran memakai transfer dari akun aset."
            : "Bisa negatif. Mengubah saldo awal memperbarui saldo dompet tanpa membuat pemasukan baru."}
        </p>
        {wallet && (
          <>
            <label className="check-line">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => setArchived(e.target.checked)}
              />
              Arsipkan dompet dari input baru
            </label>
            <button
              type="button"
              className="button text-danger small-button wallet-delete-action"
              onClick={() => {
                setDeleteText("");
                setDeleteError("");
                setDeleteRevision(ledger.revision);
                setDeleteOpen(true);
              }}
            >
              Hapus dompet
            </button>
          </>
        )}
      </EditorDialog>
      {wallet && (
        <Modal
          open={deleteOpen}
          onClose={() => {
            if (!deleteBusy) setDeleteOpen(false);
          }}
          busy={deleteBusy}
          title="Hapus dompet?"
          description={`Dompet “${wallet.name}” dan saldo awalnya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`}
        >
          <div className="notice notice-warning">
            {walletInUse
              ? "Dompet ini masih dipakai oleh transaksi atau fitur lain. Pindahkan atau hapus data terkait terlebih dahulu, atau arsipkan dompet."
              : isLastActiveWallet
                ? "Dompet aktif terakhir tidak dapat dihapus. Buat atau aktifkan dompet lain terlebih dahulu."
                : "Pastikan kamu sudah menyimpan backup jika ingin menyimpan data ini."}
          </div>
          {!walletInUse && !isLastActiveWallet && (
            <div className="field">
              <label htmlFor="wallet-delete-confirm">
                Ketik HAPUS untuk mengonfirmasi
              </label>
              <input
                id="wallet-delete-confirm"
                value={deleteText}
                onChange={(event) => setDeleteText(event.target.value)}
                placeholder="HAPUS"
                autoComplete="off"
                disabled={deleteBusy}
              />
            </div>
          )}
          {deleteError && <ErrorNotice>{deleteError}</ErrorNotice>}
          {ledgerChanged && (
            <ErrorNotice>
              Data berubah di tab lain. Tutup konfirmasi dan periksa ulang
              sebelum menghapus dompet.
            </ErrorNotice>
          )}
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteBusy}
            >
              Batal
            </button>
            <button
              className="button danger"
              disabled={
                deleteText !== "HAPUS" ||
                deleteBusy ||
                walletInUse ||
                isLastActiveWallet ||
                ledgerChanged
              }
              onClick={() => void removeWallet()}
            >
              {deleteBusy ? "Menghapus…" : "Hapus dompet"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function TransferEditor({
  transfer,
  onClose,
}: {
  transfer?: Transfer;
  onClose: () => void;
}) {
  const ledger = useLedger();
  const active = ledger.wallets.filter((w) => !w.archived);
  const [id] = useState(() => transfer?.id ?? crypto.randomUUID());
  const [source, setSource] = useState(
    transfer?.sourceWalletId ?? active[0]?.id ?? "",
  );
  const [target, setTarget] = useState(
    transfer?.targetWalletId ?? active[1]?.id ?? "",
  );
  const [amount, setAmount] = useState(
    transfer?.amount.toLocaleString("id-ID") ?? "",
  );
  const [date, setDate] = useState(transfer?.date ?? localDate());
  const [note, setNote] = useState(transfer?.note ?? "");
  return (
    <EditorDialog
      title={transfer ? "Ubah transfer" : "Transfer antar dompet"}
      description="Memindahkan saldo tanpa menambah pemasukan atau pengeluaran. Biaya admin dicatat sebagai pengeluaran terpisah."
      onClose={onClose}
      saveLabel="Simpan transfer"
      onDelete={
        transfer ? () => db.removeEntity("transfers", transfer) : undefined
      }
      onSave={() =>
        db.saveEntity(
          "transfers",
          {
            id,
            sourceWalletId: source,
            targetWalletId: target,
            amount: parseAmount(amount),
            date,
            note: note.trim(),
            createdAt: transfer?.createdAt ?? new Date().toISOString(),
            updatedAt: transfer?.updatedAt ?? new Date().toISOString(),
          },
          Boolean(transfer),
        )
      }
    >
      <WalletPicker
        label="Dompet asal"
        value={source}
        onChange={setSource}
        archivedId={transfer?.sourceWalletId}
      />
      <WalletPicker
        label="Dompet tujuan"
        value={target}
        onChange={setTarget}
        archivedId={transfer?.targetWalletId}
      />
      <AmountField value={amount} onChange={setAmount} />
      <div className="field">
        <label htmlFor="transfer-date">Tanggal transfer</label>
        <DatePicker
          id="transfer-date"
          min="1900-01-01"
          max="9999-12-31"
          value={date}
          onChange={setDate}
        />
      </div>
      <div className="field">
        <label htmlFor="transfer-note">Catatan transfer</label>
        <textarea
          id="transfer-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Misalnya, pindah dana ke rekening utama"
          maxLength={500}
        />
      </div>
    </EditorDialog>
  );
}
export default function Wallets() {
  const ledger = useLedger();
  const [walletEditor, setWalletEditor] = useState<Wallet | "new" | null>(null);
  const [transferEditor, setTransferEditor] = useState<Transfer | "new" | null>(
    null,
  );
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const balances = useMemo(() => walletBalances(ledger), [ledger]);
  const total = useMemo(() => ledgerTotals(ledger), [ledger]);
  const transfers = useMemo(
    () =>
      [...ledger.transfers].sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt),
      ),
    [ledger.transfers],
  );
  const wallets = ledger.wallets.filter((w) => w.archived === archived);
  const pages = Math.min(page, Math.max(1, Math.ceil(transfers.length / 30)));
  const activeWalletCount = ledger.wallets.filter((w) => !w.archived).length;
  const hidden = ledger.preferences.hideAmounts;
  const names = new Map(ledger.wallets.map((w) => [w.id, w.name]));
  return (
    <>
      <PageHeading
        eyebrow="TEMPAT UANGMU"
        title="Dompet"
        description="Pisahkan tempat menyimpan uang, tetap lihat satu gambaran utuh."
        action={
          <button
            className="button primary"
            onClick={() => setWalletEditor("new")}
          >
            <Plus size={17} />
            Tambah dompet
          </button>
        }
      />
      <div className="ledger-statement">
        <div>
          <span>Saldo gabungan</span>
          <strong>{money(total.balance, hidden)}</strong>
        </div>
        <p>
          {ledger.wallets.filter((w) => !w.archived).length} dompet aktif ·
          termasuk saldo dompet yang diarsipkan
        </p>
      </div>
      <section className="surface wallet-register">
        <div className="section-heading">
          <div className="tabs">
            <button
              className={!archived ? "active" : ""}
              aria-pressed={!archived}
              onClick={() => setArchived(false)}
            >
              Aktif
            </button>
            <button
              className={archived ? "active" : ""}
              aria-pressed={archived}
              onClick={() => setArchived(true)}
            >
              Diarsipkan
            </button>
          </div>
          <span className="muted small">Pilih dompet untuk mengubah</span>
        </div>
        {wallets.length ? (
          wallets.map((w) => (
            <button
              key={w.id}
              className="register-row wallet-row"
              onClick={() => setWalletEditor(w)}
              aria-label={`Ubah dompet ${w.name}`}
            >
              <div>
                <strong>{w.name}</strong>
                <small>{walletTypes[w.type]}</small>
              </div>
              <span className="register-meta">
                Saldo awal {money(w.openingBalance, hidden)}
              </span>
              <strong className="numeric">
                {money(balances.get(w.id) ?? 0, hidden)}
              </strong>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ))
        ) : (
          <EmptyState
            compact
            icon={Archive}
            title="Belum ada dompet arsip"
            description="Dompet yang diarsipkan akan tetap menyimpan riwayat dan saldonya."
          />
        )}
      </section>
      <section className="surface transfer-register">
        <div className="section-heading">
          <div>
            <h2>Transfer antar dompet</h2>
            <p>Perpindahan uang, terpisah dari arus kas</p>
          </div>
          <button
            className="button secondary"
            disabled={ledger.wallets.filter((w) => !w.archived).length < 2}
            onClick={() => setTransferEditor("new")}
          >
            <ArrowLeftRight size={14} />
            Transfer
          </button>
        </div>
        {transfers.length ? (
          transfers.slice((pages - 1) * 30, pages * 30).map((t) => (
            <button
              className="register-row transfer-row"
              key={t.id}
              onClick={() => setTransferEditor(t)}
              aria-label={`Ubah transfer ${names.get(t.sourceWalletId)} ke ${names.get(t.targetWalletId)}`}
            >
              <div>
                <strong>
                  {names.get(t.sourceWalletId)}{" "}
                  <ArrowRight size={14} className="muted" aria-hidden="true" />{" "}
                  {names.get(t.targetWalletId)}
                </strong>
                <small>{t.note || "Transfer"}</small>
              </div>
              <span className="register-meta">
                {dateLabel(t.date, ledger.preferences.dateFormat)}
              </span>
              <strong className="numeric">{money(t.amount, hidden)}</strong>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          ))
        ) : (
          <EmptyState
            compact
            icon={ArrowLeftRight}
            title="Belum ada transfer"
            description={
              ledger.wallets.filter((w) => !w.archived).length < 2
                ? "Tambahkan satu dompet lagi untuk memindahkan uang."
                : "Pindahkan uang antar dompet tanpa mengubah total keuanganmu."
            }
            action={
              activeWalletCount < 2 ? (
                <button
                  className="button secondary small-button"
                  onClick={() => setWalletEditor("new")}
                >
                  <Plus size={15} />
                  Tambah dompet kedua
                </button>
              ) : undefined
            }
          />
        )}
        {transfers.length > 0 && (
          <Pagination
            page={pages}
            count={transfers.length}
            onChange={setPage}
            noun="transfer"
          />
        )}
      </section>
      <p className="page-footnote">
        Saldo dompet = saldo awal + pemasukan − pengeluaran + transfer masuk −
        transfer keluar.{" "}
        <Link to="/transaksi" className="text-link">
          Lihat transaksi
        </Link>
      </p>
      {walletEditor && (
        <WalletEditor
          wallet={walletEditor === "new" ? undefined : walletEditor}
          onClose={() => setWalletEditor(null)}
        />
      )}
      {transferEditor && (
        <TransferEditor
          transfer={transferEditor === "new" ? undefined : transferEditor}
          onClose={() => setTransferEditor(null)}
        />
      )}
    </>
  );
}
