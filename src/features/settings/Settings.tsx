import { Modal } from "../../components/Modal";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  HardDrive,
  Monitor,
  Moon,
  Pencil,
  Plus,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { Link } from "react-router";
import { useLedger, useNotify } from "../../components/LedgerProvider";
import { SelectField } from "../../components/SelectField";
import { ErrorNotice, PageHeading } from "../../components/ui";
import { db } from "../../data/database";
import { errorMessage, parseAmount } from "../../domain/ledger";
import type { Category, Theme, TransactionKind } from "../../domain/ledger";

function CategoryDialog({
  category,
  onClose,
}: {
  category?: Category;
  onClose: () => void;
}) {
  const notify = useNotify();
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<TransactionKind>(
    category?.kind ?? "expense",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    if (!name.trim()) {
      setError("Isi nama kategori terlebih dahulu.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await db.saveCategory({
        id: category?.id ?? crypto.randomUUID(),
        name: name.trim(),
        kind,
        archived: category?.archived ?? false,
      });
      notify(
        category
          ? "Nama kategori diperbarui di seluruh catatan."
          : "Kategori baru ditambahkan.",
      );
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
      title={category ? "Ubah kategori" : "Kategori baru"}
      description={
        category
          ? "Mengganti nama juga memperbarui label pada transaksi yang memakai kategori ini."
          : "Beri nama yang mudah kamu kenali saat mencatat transaksi."
      }
    >
      <form onSubmit={(e) => void save(e)}>
        <div className="field">
          <label htmlFor="category-name">Nama kategori</label>
          <input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            disabled={busy}
            placeholder="Misalnya, Kebutuhan rumah"
          />
        </div>
        <div className="field">
          <label htmlFor="category-kind">Jenis</label>
          <SelectField
            id="category-kind"
            value={kind}
            onValueChange={(value) => setKind(value as TransactionKind)}
            disabled={busy || Boolean(category)}
            options={[
              { value: "expense", label: "Pengeluaran" },
              { value: "income", label: "Pemasukan" },
            ]}
          />
          {category && (
            <p className="field-hint">
              Jenis kategori tetap agar riwayat tidak berubah arti.
            </p>
          )}
        </div>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            Batal
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan kategori"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function Settings() {
  const ledger = useLedger();
  const notify = useNotify();
  const balanceWallet =
    ledger.wallets.find((w) => w.id === "main-wallet") ?? ledger.wallets[0];
  const [openingBalance, setOpeningBalance] = useState(
    balanceWallet.openingBalance.toLocaleString("id-ID"),
  );
  const [balanceError, setBalanceError] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState<Category | "new" | null>(
    null,
  );
  const [categoryView, setCategoryView] = useState<"active" | "archived">(
    "active",
  );
  const [resetRevision, setResetRevision] = useState<number | null>(null);
  const [resetText, setResetText] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [storage, setStorage] = useState<{
    usage?: number;
    quota?: number;
    persistent?: boolean;
  } | null>(null);
  useEffect(() => {
    setOpeningBalance(balanceWallet.openingBalance.toLocaleString("id-ID"));
  }, [balanceWallet.openingBalance]);
  useEffect(() => {
    async function inspect() {
      try {
        const estimate = await navigator.storage?.estimate();
        const persistent = await navigator.storage?.persisted?.();
        setStorage({ ...estimate, persistent });
      } catch {
        setStorage({});
      }
    }
    void inspect();
  }, []);
  async function updateTheme(theme: Theme) {
    try {
      await db.updatePreferences({ theme });
      notify("Tema diperbarui.");
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  async function saveBalance(e: FormEvent) {
    e.preventDefault();
    if (savingBalance) return;
    setSavingBalance(true);
    setBalanceError("");
    try {
      await db.saveEntity(
        "wallets",
        {
          ...balanceWallet,
          openingBalance: parseAmount(openingBalance, true),
        },
        true,
      );
      notify("Saldo awal tersimpan. Pemasukan periode tidak berubah.");
    } catch (e) {
      setBalanceError(errorMessage(e));
    } finally {
      setSavingBalance(false);
    }
  }
  async function archive(category: Category) {
    try {
      await db.saveCategory({ ...category, archived: !category.archived });
      notify(
        category.archived
          ? "Kategori diaktifkan kembali."
          : "Kategori diarsipkan. Riwayat lama tetap utuh.",
      );
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  async function persist() {
    try {
      const result = await navigator.storage?.persist?.();
      setStorage((s) => ({ ...s, persistent: result }));
      notify(
        result
          ? "Browser menyetujui penyimpanan persisten. Tetap buat backup rutin."
          : "Browser belum menyetujui penyimpanan persisten. Backup tetap menjadi perlindungan utamamu.",
      );
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
  async function reset() {
    if (resetBusy || resetText !== "HAPUS" || resetRevision === null) return;
    setResetBusy(true);
    setResetError("");
    try {
      await db.reset(resetRevision);
      setResetRevision(null);
      setResetText("");
      notify("Data lokal direset. Kategori awal kembali tersedia.");
    } catch (e) {
      setResetError(errorMessage(e));
    } finally {
      setResetBusy(false);
    }
  }
  const categoryTransactionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transaction of ledger.transactions)
      counts.set(
        transaction.categoryId,
        (counts.get(transaction.categoryId) ?? 0) + 1,
      );
    return counts;
  }, [ledger.transactions]);
  const visibleCategories = useMemo(
    () =>
      ledger.categories.filter((category) =>
        categoryView === "archived" ? category.archived : !category.archived,
      ),
    [ledger.categories, categoryView],
  );
  const full =
    storage?.usage && storage.quota
      ? storage.usage / storage.quota >= 0.8
      : false;
  return (
    <>
      <PageHeading
        eyebrow="BUAT TERASA MILIKMU"
        title="Pengaturan"
        description="Sesuaikan tampilan, kategori, dan penyimpanan catatanmu."
      />
      <div className="settings-layout">
        <section className="settings-section">
          <div className="settings-description">
            <h2>Tampilan</h2>
            <p>Nyaman untuk dipakai setiap hari.</p>
          </div>
          <div className="surface settings-content">
            <h3>Tema aplikasi</h3>
            <div className="theme-options">
              {(
                [
                  { value: "light", label: "Terang", Icon: Sun },
                  { value: "dark", label: "Gelap", Icon: Moon },
                  { value: "system", label: "Perangkat", Icon: Monitor },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  className={
                    ledger.preferences.theme === value ? "selected" : ""
                  }
                  key={value}
                  aria-pressed={ledger.preferences.theme === value}
                  onClick={() => void updateTheme(value)}
                >
                  <Icon size={22} />
                  <span>{label}</span>
                  {ledger.preferences.theme === value && (
                    <Check className="theme-check" size={14} />
                  )}
                </button>
              ))}
            </div>
            <div className="setting-row">
              <label htmlFor="date-format">Format tanggal</label>
              <SelectField
                id="date-format"
                value={ledger.preferences.dateFormat}
                onValueChange={(value) =>
                  void db
                    .updatePreferences({
                      dateFormat: value as "short" | "long",
                    })
                    .catch((err) => notify(errorMessage(err), true))
                }
                options={[
                  { value: "long", label: "17 Okt 2026" },
                  { value: "short", label: "17/10/2026" },
                ]}
              />
            </div>
            <div className="setting-row">
              <label htmlFor="hide-amounts">Sembunyikan nominal</label>
              <input
                id="hide-amounts"
                className="switch"
                type="checkbox"
                role="switch"
                checked={ledger.preferences.hideAmounts}
                onChange={(e) =>
                  void db
                    .updatePreferences({ hideAmounts: e.target.checked })
                    .catch((err) => notify(errorMessage(err), true))
                }
              />
            </div>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-description">
            <h2>Saldo awal {balanceWallet.name}</h2>
            <p>
              Saldo awal sekarang dikelola per dompet.{" "}
              <Link to="/dompet" className="text-link">
                Kelola semua dompet →
              </Link>
            </p>
          </div>
          <form
            className="surface settings-content"
            onSubmit={(e) => void saveBalance(e)}
          >
            <div className="field">
              <label htmlFor="opening-balance">
                Saldo sebelum transaksi pertama (Rp)
              </label>
              <input
                id="opening-balance"
                inputMode="text"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                disabled={savingBalance}
                aria-invalid={Boolean(balanceError)}
                aria-describedby="opening-help"
              />
              <p className="field-hint" id="opening-help">
                Dihitung ke saldo keseluruhan, terpisah dari pemasukan bulanan.
                Bisa negatif, misalnya −50.000 ditulis -50000.
              </p>
            </div>
            {balanceError && <ErrorNotice>{balanceError}</ErrorNotice>}
            <button
              className="button secondary"
              disabled={savingBalance}
              type="submit"
            >
              {savingBalance ? "Menyimpan…" : "Simpan saldo awal"}
            </button>
          </form>
        </section>
        <section className="settings-section" id="categories">
          <div className="settings-description">
            <h2>Kategori</h2>
            <p>
              Rapikan sesuai kebiasaanmu. Arsip menyembunyikan kategori dari
              input baru tanpa menghapus riwayat.
            </p>
          </div>
          <div className="surface settings-content">
            <div className="section-heading">
              <div className="tabs">
                <button
                  className={categoryView === "active" ? "active" : ""}
                  aria-pressed={categoryView === "active"}
                  onClick={() => setCategoryView("active")}
                >
                  Aktif
                </button>
                <button
                  className={categoryView === "archived" ? "active" : ""}
                  aria-pressed={categoryView === "archived"}
                  onClick={() => setCategoryView("archived")}
                >
                  Diarsipkan
                </button>
              </div>
              <button
                className="button secondary small-button"
                onClick={() => setCategoryDialog("new")}
              >
                <Plus size={16} />
                Kategori
              </button>
            </div>
            <div className="category-manager">
              {visibleCategories.length === 0 && (
                <p className="muted">
                  Belum ada kategori{" "}
                  {categoryView === "archived" ? "yang diarsipkan" : "aktif"}.
                </p>
              )}
              {visibleCategories.map((c) => (
                <div className="category-manager-row" key={c.id}>
                  <div>
                    <strong>{c.name}</strong>
                    <span>
                      {c.kind === "income" ? "Pemasukan" : "Pengeluaran"} ·{" "}
                      {categoryTransactionCounts.get(c.id) ?? 0} transaksi
                    </span>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Ubah kategori ${c.name}`}
                    onClick={() => setCategoryDialog(c)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`${c.archived ? "Aktifkan" : "Arsipkan"} kategori ${c.name}`}
                    onClick={() => void archive(c)}
                  >
                    {c.archived ? (
                      <ArchiveRestore size={17} />
                    ) : (
                      <Archive size={17} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="settings-section">
          <div className="settings-description">
            <h2>Penyimpanan & privasi</h2>
            <p>Catatan ini milikmu sepenuhnya.</p>
          </div>
          <div className="surface settings-content">
            <div className="storage-heading">
              <HardDrive size={24} />
              <div>
                <h3>Browser di perangkat ini</h3>
                <p>
                  {storage?.usage !== undefined
                    ? `${(storage.usage / 1024 / 1024).toLocaleString("id-ID", { maximumFractionDigits: 2 })} MB digunakan oleh situs ini`
                    : "Informasi kapasitas tidak tersedia di browser ini"}
                </p>
              </div>
            </div>
            {full && (
              <div className="notice notice-warning">
                Penyimpanan situs hampir penuh. Buat backup dan kosongkan ruang
                perangkat sebelum menambah catatan.
              </div>
            )}
            <p className="muted">
              Tidak ada akun, pelacakan aktivitas, atau pengiriman isi transaksi
              ke server. Orang yang memakai browser dan perangkat yang sama
              dapat melihat catatanmu. Data belum dienkripsi.
            </p>
            <p className="muted">
              Data bisa hilang saat data situs dibersihkan atau sesi privat
              ditutup. Izin penyimpanan persisten membantu mengurangi
              penghapusan otomatis oleh browser, tetapi tidak menggantikan
              backup.
            </p>
            <div className="button-group">
              <button
                className="button secondary"
                onClick={() => void persist()}
                disabled={
                  Boolean(storage?.persistent) || !navigator.storage?.persist
                }
              >
                {storage?.persistent ? (
                  <>
                    <ShieldCheck size={17} />
                    Penyimpanan persisten aktif
                  </>
                ) : (
                  "Minta penyimpanan persisten"
                )}
              </button>
              <Link className="text-link" to="/backup">
                Buat backup
              </Link>
            </div>
          </div>
        </section>
        <section className="settings-section danger-zone">
          <div className="settings-description">
            <h2>Reset data</h2>
            <p>Hapus seluruh catatan dari browser ini.</p>
          </div>
          <div className="surface settings-content">
            <h3>Mulai dengan catatan kosong</h3>
            <p className="muted">
              Semua transaksi, kategori buatanmu, dan saldo awal akan dihapus.
              Simpan backup sebelum melanjutkan.
            </p>
            <div className="button-group">
              <Link to="/backup" className="button secondary">
                Backup dulu
              </Link>
              <button
                className="button text-danger"
                onClick={() => {
                  setResetText("");
                  setResetError("");
                  setResetRevision(ledger.revision);
                }}
              >
                Reset data lokal
              </button>
            </div>
          </div>
        </section>
      </div>
      {categoryDialog && (
        <CategoryDialog
          category={categoryDialog === "new" ? undefined : categoryDialog}
          onClose={() => setCategoryDialog(null)}
        />
      )}
      <Modal
        open={resetRevision !== null}
        onClose={() => setResetRevision(null)}
        busy={resetBusy}
        title="Hapus seluruh data lokal?"
        description={`${ledger.transactions.length} transaksi, seluruh dompet, transfer, anggaran, jadwal, dan target akan dihapus. Pemulihan hanya tersedia lewat file backup milikmu.`}
      >
        <div className="notice notice-warning">
          Pastikan file backup sudah disimpan di lokasi lain. Tindakan ini tidak
          dapat dibatalkan.
        </div>
        <div className="field">
          <label htmlFor="reset-confirm">Ketik HAPUS untuk mengonfirmasi</label>
          <input
            id="reset-confirm"
            value={resetText}
            onChange={(e) => setResetText(e.target.value)}
            autoComplete="off"
            disabled={resetBusy}
          />
        </div>
        {resetError && <ErrorNotice>{resetError}</ErrorNotice>}
        <div className="modal-footer">
          <button
            className="button secondary"
            onClick={() => setResetRevision(null)}
            disabled={resetBusy}
          >
            Batal
          </button>
          <button
            className="button danger"
            disabled={
              resetText !== "HAPUS" ||
              resetBusy ||
              resetRevision !== ledger.revision
            }
            onClick={() => void reset()}
          >
            {resetBusy ? "Menghapus…" : "Hapus semua data"}
          </button>
        </div>
        {resetRevision !== null && resetRevision !== ledger.revision && (
          <ErrorNotice>
            Data berubah di tab lain. Tutup dan periksa ulang sebelum reset.
          </ErrorNotice>
        )}
      </Modal>
    </>
  );
}
