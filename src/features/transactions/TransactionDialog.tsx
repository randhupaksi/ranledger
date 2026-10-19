import { Modal } from "../../components/Modal";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Trash2 } from "lucide-react";
import { db } from "../../data/database";
import {
  errorMessage,
  localDate,
  money,
  parseAmount,
  validDate,
} from "../../domain/ledger";
import type { Transaction, TransactionKind } from "../../domain/ledger";
import {
  useLedger,
  useNotify,
  useCanEdit,
} from "../../components/LedgerProvider";
import { SelectField } from "../../components/SelectField";
import { ErrorNotice } from "../../components/ui";
import { WalletPicker } from "../../components/planning-ui";

function formatAmountDigits(value: string) {
  return value.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function isFormattedAmount(value: string) {
  return (
    value === "" || /^\d+$/.test(value) || /^\d{1,3}(?:\.\d{3})+$/.test(value)
  );
}

function caretAfterDigits(value: string, digitCount: number) {
  let index = 0;
  let digits = 0;
  while (index < value.length && digits < digitCount) {
    if (/\d/.test(value[index])) digits += 1;
    index += 1;
  }
  while (value[index] === ".") index += 1;
  return index;
}

export default function TransactionDialog({
  transaction,
  onClose,
}: {
  transaction?: Transaction;
  onClose: () => void;
}) {
  const ledger = useLedger();
  const notify = useNotify();
  const [kind, setKind] = useState<TransactionKind>(
    transaction?.kind ?? "expense",
  );
  const [amount, setAmount] = useState(
    transaction ? transaction.amount.toLocaleString("id-ID") : "",
  );
  const [categoryId, setCategoryId] = useState(
    transaction?.categoryId ??
      ledger.categories.find((c) => c.id === "food" && !c.archived)?.id ??
      ledger.categories.find((c) => c.kind === "expense" && !c.archived)?.id ??
      "",
  );
  const [date, setDate] = useState(transaction?.date ?? localDate());
  const [walletId, setWalletId] = useState(
    transaction?.walletId ?? ledger.wallets.find((w) => !w.archived)?.id ?? "",
  );
  const [note, setNote] = useState(transaction?.note ?? "");
  const [error, setError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refund, setRefund] = useState(transaction?.refund ?? false);
  const canEdit = useCanEdit();
  const saving = useRef(false);
  const identity = useRef(transaction?.id ?? crypto.randomUUID());
  const createdAt = useRef(transaction?.createdAt ?? new Date().toISOString());
  const amountInput = useRef<HTMLInputElement>(null);
  const amountCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const input = amountInput.current;
    if (input && amountCaret.current !== null) {
      input.setSelectionRange(amountCaret.current, amountCaret.current);
      amountCaret.current = null;
    }
  }, [amount]);
  function updateAmountDigits(digits: string, digitsBeforeCaret: number) {
    const formatted = formatAmountDigits(digits);
    amountCaret.current = caretAfterDigits(formatted, digitsBeforeCaret);
    setAmount(formatted);
    setAmountError("");
  }
  const categories = ledger.categories.filter(
    (c) => c.kind === kind && (!c.archived || c.id === transaction?.categoryId),
  );
  function changeKind(value: TransactionKind) {
    setKind(value);
    setCategoryId(
      value === transaction?.kind
        ? transaction.categoryId
        : (ledger.categories.find(
            (c) =>
              c.id === (value === "expense" ? "food" : "salary") && !c.archived,
          )?.id ??
            ledger.categories.find((c) => c.kind === value && !c.archived)
              ?.id ??
            ""),
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) {
      setError("Ruang ini hanya dapat dibaca.");
      return;
    }
    if (saving.current) return;
    setError("");
    setAmountError("");
    let parsed: number;
    try {
      parsed = parseAmount(amount);
    } catch (err) {
      setAmountError(errorMessage(err));
      amountInput.current?.focus();
      return;
    }
    if (!validDate(date)) {
      setError("Pilih tanggal yang valid.");
      return;
    }
    if (!categoryId) {
      setError(
        "Pilih kategori. Kamu bisa membuat kategori baru di Pengaturan.",
      );
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      await db.saveTransaction(
        {
          id: identity.current,
          kind,
          amount: parsed,
          categoryId,
          walletId,
          ...(kind === "expense" && refund ? { refund: true } : {}),
          ...(transaction?.occurrenceKey
            ? { occurrenceKey: transaction.occurrenceKey }
            : {}),
          date,
          note: note.trim(),
          createdAt: createdAt.current,
          updatedAt: transaction?.updatedAt ?? createdAt.current,
        },
        Boolean(transaction),
      );
      notify(
        transaction ? "Perubahan transaksi tersimpan." : "Transaksi tersimpan.",
      );
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!canEdit) {
      setError("Ruang ini hanya dapat dibaca.");
      return;
    }
    if (!transaction || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await db.removeTransaction(transaction);
      notify("Transaksi dihapus. Saldo sudah diperbarui.");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      title={
        deleting
          ? "Hapus transaksi ini?"
          : transaction
            ? "Ubah transaksi"
            : "Catat transaksi"
      }
      description={
        deleting
          ? "Catatan akan dihapus dan saldo langsung diperbarui. Tindakan ini tidak dapat dibatalkan."
          : "Catatan disimpan di ruang yang sedang kamu buka."
      }
      initialFocus={deleting ? undefined : amountInput}
    >
      {deleting ? (
        <>
          <div className="delete-summary">
            <strong>
              {transaction?.note ||
                ledger.categories.find((c) => c.id === transaction?.categoryId)
                  ?.name}
            </strong>
            <span>
              {money(transaction?.amount ?? 0, ledger.preferences.hideAmounts)}
            </span>
          </div>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <div className="modal-footer">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              Kembali
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Menghapus…" : "Ya, hapus transaksi"}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate>
          <fieldset className="kind-switch" disabled={busy}>
            <legend className="sr-only">Jenis transaksi</legend>
            <button
              type="button"
              className={kind === "expense" ? "selected" : ""}
              aria-pressed={kind === "expense"}
              onClick={() => changeKind("expense")}
            >
              <ArrowUpRight size={14} />
              Pengeluaran
            </button>
            <button
              type="button"
              className={kind === "income" ? "selected" : ""}
              aria-pressed={kind === "income"}
              onClick={() => changeKind("income")}
            >
              <ArrowDownLeft size={14} />
              Pemasukan
            </button>
          </fieldset>
          <div className="field amount-field">
            <label htmlFor="amount">Nominal</label>
            <div className={`amount-input ${amountError ? "invalid" : ""}`}>
              <span>Rp</span>
              <input
                id="amount"
                ref={amountInput}
                value={amount}
                onChange={(e) => {
                  const inputValue = e.currentTarget.value;
                  const inputEvent = e.nativeEvent as InputEvent;
                  const hasUnsupportedCharacters = /[^\d.]/.test(inputValue);
                  const hasIncompleteGrouping =
                    inputValue.includes(".") &&
                    !/^\d{1,3}(?:\.\d{3})+$/.test(inputValue);
                  const manuallyEnteredSeparator =
                    inputEvent.data?.includes(".") ||
                    inputEvent.inputType === "insertFromPaste";

                  if (
                    hasUnsupportedCharacters ||
                    (hasIncompleteGrouping &&
                      (manuallyEnteredSeparator ||
                        amount === "" ||
                        !isFormattedAmount(amount)))
                  ) {
                    setAmount(inputValue);
                    setAmountError("");
                    return;
                  }

                  const caret =
                    e.currentTarget.selectionStart ?? inputValue.length;
                  const digitsBeforeCaret = inputValue
                    .slice(0, caret)
                    .replace(/\D/g, "").length;
                  updateAmountDigits(
                    inputValue.replace(/\D/g, ""),
                    digitsBeforeCaret,
                  );
                }}
                onKeyDown={(e) => {
                  const input = e.currentTarget;
                  const start = input.selectionStart ?? 0;
                  const end = input.selectionEnd ?? start;
                  if (start !== end || !isFormattedAmount(amount)) return;

                  const digits = amount.replace(/\D/g, "");
                  const digitsBeforeCaret = amount
                    .slice(0, start)
                    .replace(/\D/g, "").length;
                  if (e.key === "Backspace" && amount[start - 1] === ".") {
                    e.preventDefault();
                    const removeIndex = digitsBeforeCaret - 1;
                    updateAmountDigits(
                      digits.slice(0, removeIndex) +
                        digits.slice(removeIndex + 1),
                      removeIndex,
                    );
                  } else if (e.key === "Delete" && amount[start] === ".") {
                    e.preventDefault();
                    updateAmountDigits(
                      digits.slice(0, digitsBeforeCaret) +
                        digits.slice(digitsBeforeCaret + 1),
                      digitsBeforeCaret,
                    );
                  }
                }}
                onBlur={() => {
                  try {
                    if (amount)
                      setAmount(parseAmount(amount).toLocaleString("id-ID"));
                  } catch {
                    /* Invalid text remains available for correction. */
                  }
                }}
                placeholder="Misalnya, 250.000"
                inputMode="numeric"
                autoComplete="off"
                maxLength={24}
                aria-invalid={Boolean(amountError)}
                aria-describedby={amountError ? "amount-error" : "amount-help"}
                disabled={busy}
              />
            </div>
            {amountError ? (
              <p className="field-error" id="amount-error" role="alert">
                {amountError}
              </p>
            ) : (
              <p className="field-hint" id="amount-help">
                Rupiah bulat, tanpa desimal.
              </p>
            )}
          </div>
          <div className="form-grid">
            <WalletPicker
              value={walletId}
              onChange={setWalletId}
              archivedId={transaction?.walletId}
              disabled={busy}
            />
            <div className="field">
              <label htmlFor="category">Kategori</label>
              <SelectField
                id="category"
                value={categoryId}
                onValueChange={setCategoryId}
                disabled={busy}
                required
                placeholder="Belum ada kategori aktif"
                options={categories.map((category) => ({
                  value: category.id,
                  label: `${category.name}${category.archived ? " (diarsipkan)" : ""}`,
                }))}
              />
            </div>
            <div className="field">
              <label htmlFor="date">Tanggal</label>
              <input
                id="date"
                type="date"
                min="1900-01-01"
                max="9999-12-31"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={busy}
                required
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="note">
              Catatan <span>opsional</span>
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                kind === "expense"
                  ? "Misalnya, makan siang di kantor"
                  : "Misalnya, pembayaran proyek website"
              }
              rows={3}
              maxLength={500}
              disabled={busy}
            />
            <p className="field-hint align-right">{note.length}/500</p>
          </div>
          {kind === "expense" && (
            <label className="check-line">
              <input
                type="checkbox"
                checked={refund}
                disabled={busy || !canEdit}
                onChange={(e) => setRefund(e.target.checked)}
              />
              Pengembalian dana (refund) · mengurangi pengeluaran kategori
            </label>
          )}
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <div className="modal-footer">
            {transaction && (
              <button
                className="button text-danger delete-button"
                type="button"
                disabled={busy}
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={17} />
                Hapus
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={busy}
            >
              Batal
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={busy || !categoryId || !canEdit}
            >
              {busy
                ? "Menyimpan…"
                : transaction
                  ? "Simpan perubahan"
                  : `Simpan ${kind === "income" ? "pemasukan" : "pengeluaran"}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
