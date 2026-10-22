import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, FileUp } from "lucide-react";
import { useLedger, useNotify } from "../../components/LedgerProvider";
import { ErrorNotice, PageHeading, Pagination } from "../../components/ui";
import { WalletPicker } from "../../components/planning-ui";
import { SelectField } from "../../components/SelectField";
import { Modal } from "../../components/Modal";
import { db } from "../../data/database";
import type { CsvData, CsvMapping, CsvPreviewRow } from "../../data/csv";
import { dateLabel, errorMessage, money } from "../../domain/ledger";

export default function ImportCsv() {
  const ledger = useLedger(),
    notify = useNotify();
  const [data, setData] = useState<CsvData | null>(null),
    [filename, setFilename] = useState("");
  const [mapping, setMapping] = useState<CsvMapping>({
    date: -1,
    amount: -1,
    note: -1,
    kind: -1,
    category: -1,
    debit: -1,
    credit: -1,
    direction: "expense",
    dateFormat: "iso",
    numberFormat: "id",
    walletId: ledger.wallets.find((w) => !w.archived)?.id ?? "",
    incomeCategoryId:
      ledger.categories.find((c) => c.id === "other-income" && !c.archived)
        ?.id ??
      ledger.categories.find((c) => c.kind === "income" && !c.archived)?.id ??
      "",
    expenseCategoryId:
      ledger.categories.find((c) => c.id === "other-expense" && !c.archived)
        ?.id ??
      ledger.categories.find((c) => c.kind === "expense" && !c.archived)?.id ??
      "",
  });
  const [preview, setPreview] = useState<{
    rows: CsvPreviewRow[];
    revision: number;
  } | null>(null);
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false),
    [success, setSuccess] = useState(0);
  const worker = useRef<Worker | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    lock = useRef(false);
  useEffect(() => () => worker.current?.terminate(), []);
  function work<T>(request: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const instance = new Worker(
        new URL("../../data/csv.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = instance;
      instance.onmessage = ({ data: response }) => {
        instance.terminate();
        worker.current = null;
        if (response.error) reject(new Error(response.error));
        else resolve(response.result);
      };
      instance.onerror = () => {
        instance.terminate();
        worker.current = null;
        reject(
          new Error("Pemrosesan Excel gagal. Coba file yang lebih kecil."),
        );
      };
      instance.postMessage(request);
    });
  }
  function change<K extends keyof CsvMapping>(key: K, value: CsvMapping[K]) {
    setMapping((old) => ({ ...old, [key]: value }));
    setPreview(null);
    setSuccess(0);
  }
  async function selectFile(file?: File) {
    if (!file || lock.current) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Pilih file Excel berformat .xlsx.");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      setError("Ukuran file Excel maksimal 16 MB.");
      return;
    }
    lock.current = true;
    setBusy("read");
    setError("");
    setPreview(null);
    setSuccess(0);
    setData(null);
    try {
      const parsed = await work<CsvData>({
        type: "parse",
        buffer: await file.arrayBuffer(),
      });
      setData(parsed);
      setFilename(file.name);
      const find = (pattern: RegExp) =>
        parsed.headers.findIndex((h) => pattern.test(h.trim()));
      const kind = find(/^(jenis|kind|type)$/i);
      setMapping((old) => ({
        ...old,
        date: find(/^(tanggal|date|transaction.?date)$/i),
        amount: find(/^(nominal|amount|jumlah)$/i),
        note: find(/^(catatan|note|keterangan|description)$/i),
        kind,
        direction: kind >= 0 ? "column" : "expense",
        dateFormat: "iso",
        category: find(/^(kategori|category)$/i),
        debit: find(/^(debit|debet)$/i),
        credit: find(/^(credit|kredit)$/i),
      }));
    } catch (e) {
      setData(null);
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function inspect() {
    if (!data || lock.current) return;
    lock.current = true;
    setBusy("preview");
    setError("");
    try {
      const current = await db.snapshot();
      const rows = await work<CsvPreviewRow[]>({
        type: "preview",
        data,
        mapping,
        ledger: current,
      });
      setPreview({ rows, revision: current.revision });
      setPage(1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  const selected =
    preview?.rows.filter((r) => r.include && r.transaction) ?? [];
  const reconciled =
    preview?.rows.filter((r) => r.reconciled && (r.matchedId || r.similarId)) ??
    [];
  const stale = Boolean(preview && preview.revision !== ledger.revision);
  const duplicates = preview?.rows.filter((r) => r.duplicate).length ?? 0;
  const invalid = preview?.rows.filter((r) => r.error).length ?? 0;
  const columns = [
    { value: "-1", label: "Tidak dipetakan" },
    ...(data?.headers.map((label, index) => ({
      value: String(index),
      label,
    })) ?? []),
  ];
  function column(
    key: "date" | "amount" | "note" | "kind" | "category" | "debit" | "credit",
    label: string,
  ) {
    return (
      <div className="field">
        <label htmlFor={`csv-${key}`}>{label}</label>
        <SelectField
          id={`csv-${key}`}
          value={String(mapping[key])}
          onValueChange={(v) => change(key, Number(v))}
          options={columns}
        />
      </div>
    );
  }
  function updateRow(index: number, values: Partial<CsvPreviewRow>) {
    setPreview(
      (old) =>
        old && {
          ...old,
          rows: old.rows.map((r, i) => (i === index ? { ...r, ...values } : r)),
        },
    );
  }
  async function commit() {
    if (
      !preview ||
      stale ||
      (!selected.length && !reconciled.length) ||
      lock.current
    )
      return;
    lock.current = true;
    setBusy("import");
    setError("");
    try {
      await db.importTransactions(
        selected.map((r) => r.transaction!),
        preview.revision,
        filename,
        reconciled.map((r) => ({
          line: r.line,
          transactionId: r.matchedId ?? r.similarId!,
        })),
      );
      setSuccess(selected.length);
      notify(
        `${selected.length.toLocaleString("id-ID")} transaksi baru dan ${reconciled.length} pencocokan tersimpan.`,
      );
      setConfirm(false);
      setPreview(null);
      setData(null);
    } catch (e) {
      setError(errorMessage(e));
      setConfirm(false);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="BAWA RIWAYATMU"
        title="Impor Excel"
        description="Pindahkan transaksi dari bank atau aplikasi lain dengan pratinjau sebelum menyimpan."
      />
      <div className="v3-actions import-links">
        <Link className="text-link" to="/rekonsiliasi">
          Buka riwayat impor & aturan kategori
        </Link>
        {data && (
          <>
            <button
              className="button secondary small-button"
              onClick={() =>
                void db.syncState
                  .put({
                    id: "csvPreset",
                    value: { headers: data.headers, mapping },
                  })
                  .then(() => notify("Pemetaan disimpan di perangkat ini."))
              }
            >
              Simpan pemetaan
            </button>
            <button
              className="button secondary small-button"
              onClick={() =>
                void db.syncState.get("csvPreset").then((saved) => {
                  const preset = saved?.value as
                    { headers: string[]; mapping: CsvMapping } | undefined;
                  if (
                    !preset ||
                    JSON.stringify(preset.headers) !==
                      JSON.stringify(data.headers)
                  ) {
                    setError(
                      "Pemetaan tersimpan tidak cocok dengan nama kolom file ini.",
                    );
                    return;
                  }
                  setMapping(preset.mapping);
                  setPreview(null);
                })
              }
            >
              Gunakan pemetaan tersimpan
            </button>
          </>
        )}
      </div>
      <ol className="import-steps" aria-label="Tahap impor">
        <li className={!data ? "current" : ""}>
          1 <span>Pilih file</span>
        </li>
        <li className={data && !preview ? "current" : ""}>
          2 <span>Cocokkan kolom</span>
        </li>
        <li className={preview ? "current" : ""}>
          3 <span>Periksa & impor</span>
        </li>
      </ol>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {success > 0 && (
        <div className="notice" role="status">
          {success.toLocaleString("id-ID")} transaksi berhasil diimpor.{" "}
          <Link to="/transaksi" className="text-link">
            Lihat transaksi <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
      <section className="surface csv-source">
        <div className="section-heading">
          <div>
            <h2>{filename && data ? filename : "Pilih file transaksi"}</h2>
            <p>XLSX maksimal 16 MB · 100.000 baris · diproses di perangkat</p>
          </div>
          <button
            className="button secondary"
            disabled={Boolean(busy)}
            onClick={() => fileInput.current?.click()}
          >
            <FileUp size={17} />
            {data ? "Ganti file" : "Pilih Excel"}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          aria-label="File Excel transaksi"
          onChange={(e) => void selectFile(e.target.files?.[0])}
        />
        <div className="csv-source-foot">
          <p>
            Judul kolom dikenali otomatis pada lembar pertama, termasuk setelah
            header template. Ganti atau hapus baris contoh sebelum mengimpor.
          </p>
          <button
            className="text-link"
            disabled={Boolean(busy)}
            onClick={async () => {
              const [{ downloadFile }, { createImportTemplate }] =
                await Promise.all([
                  import("../../data/backup"),
                  import("../../data/reportExcel"),
                ]);
              downloadFile(
                await createImportTemplate(),
                "ranledger-template.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              );
            }}
          >
            Unduh template Excel
          </button>
        </div>
      </section>
      {data && (
        <section className="surface csv-mapping" data-editing="true">
          <div className="section-heading">
            <div>
              <h2>Cocokkan format dan kolom</h2>
              <p>
                {data.rows.length.toLocaleString("id-ID")} baris ditemukan.
                Pastikan angka dan tanggal dibaca dengan benar.
              </p>
            </div>
          </div>
          <fieldset disabled={Boolean(busy)} className="csv-fields">
            <div className="field">
              <label htmlFor="csv-date-format">Format tanggal</label>
              <SelectField
                id="csv-date-format"
                value={mapping.dateFormat}
                onValueChange={(v) =>
                  change("dateFormat", v as CsvMapping["dateFormat"])
                }
                options={[
                  { value: "iso", label: "YYYY-MM-DD" },
                  { value: "dmy", label: "DD/MM/YYYY" },
                  { value: "mdy", label: "MM/DD/YYYY" },
                ]}
              />
            </div>
            <div className="field">
              <label htmlFor="csv-number-format">Format angka</label>
              <SelectField
                id="csv-number-format"
                value={mapping.numberFormat}
                onValueChange={(v) =>
                  change("numberFormat", v as CsvMapping["numberFormat"])
                }
                options={[
                  { value: "id", label: "Indonesia · 1.500,00" },
                  { value: "en", label: "Internasional · 1,500.00" },
                  { value: "plain", label: "Angka bulat · 1500" },
                ]}
              />
            </div>
            <div className="field">
              <label htmlFor="csv-direction">Cara menentukan jenis</label>
              <SelectField
                id="csv-direction"
                value={mapping.direction}
                onValueChange={(v) =>
                  change("direction", v as CsvMapping["direction"])
                }
                options={[
                  { value: "expense", label: "Semua pengeluaran" },
                  { value: "income", label: "Semua pemasukan" },
                  { value: "signed", label: "Negatif keluar · positif masuk" },
                  { value: "column", label: "Dari kolom jenis" },
                  { value: "debit-credit", label: "Kolom debit dan kredit" },
                ]}
              />
            </div>
            {column("date", "Kolom tanggal")}
            {mapping.direction === "debit-credit" ? (
              <>
                {column("debit", "Kolom debit / keluar")}
                {column("credit", "Kolom kredit / masuk")}
              </>
            ) : (
              column("amount", "Kolom nominal")
            )}
            {mapping.direction === "column" && column("kind", "Kolom jenis")}
            {column("note", "Kolom catatan (opsional)")}
            {column("category", "Kolom kategori (opsional)")}
            <WalletPicker
              label="Dompet tujuan impor"
              value={mapping.walletId}
              onChange={(v) => change("walletId", v)}
            />
            {(["expense", "income"] as const).map((kind) => (
              <div className="field" key={kind}>
                <label htmlFor={`csv-default-${kind}`}>
                  Kategori default{" "}
                  {kind === "income" ? "pemasukan" : "pengeluaran"}
                </label>
                <SelectField
                  id={`csv-default-${kind}`}
                  value={
                    kind === "income"
                      ? mapping.incomeCategoryId
                      : mapping.expenseCategoryId
                  }
                  onValueChange={(v) =>
                    change(
                      kind === "income"
                        ? "incomeCategoryId"
                        : "expenseCategoryId",
                      v,
                    )
                  }
                  options={ledger.categories
                    .filter((c) => !c.archived && c.kind === kind)
                    .map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
            ))}
          </fieldset>
          <div className="csv-source-foot">
            <p>
              Kategori dicocokkan dari namanya. Jika tidak ditemukan, kategori
              default dipakai. Pecahan rupiah selain nol ditolak.
            </p>
            <button
              className="button primary"
              disabled={Boolean(busy)}
              onClick={() => void inspect()}
            >
              {busy === "preview" ? "Memeriksa…" : "Buat pratinjau"}
            </button>
          </div>
        </section>
      )}
      {busy === "read" && <p role="status">Membaca file Excel…</p>}
      {preview && (
        <section className="surface csv-preview">
          <div className="section-heading">
            <div>
              <h2>Periksa transaksi pilihanmu</h2>
              <p>
                {selected.length.toLocaleString("id-ID")} dipilih · {duplicates}{" "}
                kemungkinan duplikat · {invalid} baris tidak valid
              </p>
            </div>
            <button
              className="button primary"
              disabled={
                Boolean(busy) ||
                stale ||
                (!selected.length && !reconciled.length)
              }
              onClick={() => setConfirm(true)}
            >
              {selected.length
                ? `Impor ${selected.length.toLocaleString("id-ID")} transaksi`
                : `Konfirmasi ${reconciled.length} pencocokan`}
            </button>
          </div>
          <div className="inline-help">
            Kemungkinan duplikat ditandai berdasarkan tanggal, jenis, nominal,
            dompet, dan catatan. Baris duplikat dan tidak valid tidak dipilih
            otomatis. Kategori bisa disesuaikan per baris.
          </div>
          {stale && (
            <div className="notice notice-warning">
              Data lokal berubah. Buat pratinjau ulang sebelum mengimpor.
            </div>
          )}
          <div className="table-scroll">
            <table className="csv-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Pilih semua baris valid termasuk kemungkinan duplikat"
                      checked={
                        preview.rows.some((r) => r.transaction) &&
                        preview.rows
                          .filter((r) => r.transaction)
                          .every((r) => r.include)
                      }
                      onChange={(e) =>
                        setPreview({
                          ...preview,
                          rows: preview.rows.map((r) => ({
                            ...r,
                            include: Boolean(r.transaction) && e.target.checked,
                            reconciled: false,
                          })),
                        })
                      }
                    />
                  </th>
                  <th>Baris</th>
                  <th>Transaksi</th>
                  <th>Nominal</th>
                  <th>Kategori</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice((page - 1) * 30, page * 30).map((r, i) => (
                  <tr key={r.line}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Impor baris ${r.line}`}
                        checked={r.include}
                        disabled={!r.transaction}
                        onChange={(e) =>
                          updateRow((page - 1) * 30 + i, {
                            include: e.target.checked,
                            reconciled: false,
                          })
                        }
                      />
                    </td>
                    <td>{r.line}</td>
                    <td>
                      {r.transaction ? (
                        <>
                          <strong>
                            {r.transaction.note || "Tanpa catatan"}
                          </strong>
                          <small>
                            {dateLabel(r.transaction.date)} ·{" "}
                            {r.transaction.kind === "income"
                              ? "Pemasukan"
                              : "Pengeluaran"}
                          </small>
                        </>
                      ) : (
                        <span className="expense">{r.error}</span>
                      )}
                    </td>
                    <td className="numeric">
                      {r.transaction &&
                        money(
                          r.transaction.amount,
                          ledger.preferences.hideAmounts,
                        )}
                    </td>
                    <td>
                      {r.transaction && (
                        <SelectField
                          aria-label={`Kategori baris ${r.line}`}
                          value={r.transaction.categoryId}
                          onValueChange={(v) =>
                            updateRow((page - 1) * 30 + i, {
                              transaction: { ...r.transaction!, categoryId: v },
                            })
                          }
                          options={ledger.categories
                            .filter(
                              (c) =>
                                !c.archived && c.kind === r.transaction!.kind,
                            )
                            .map((c) => ({ value: c.id, label: c.name }))}
                        />
                      )}
                    </td>
                    <td>
                      {r.error
                        ? "Tidak valid"
                        : r.duplicate
                          ? "Periksa duplikat"
                          : "Siap"}
                      {(r.matchedId || r.similarId) && (
                        <label className="csv-match">
                          <input
                            type="checkbox"
                            aria-label={`Cocokkan baris ${r.line} dengan transaksi yang ada`}
                            checked={Boolean(r.reconciled)}
                            onChange={(e) =>
                              updateRow((page - 1) * 30 + i, {
                                reconciled: e.target.checked,
                                include: false,
                              })
                            }
                          />
                          {r.reconciled
                            ? "Dicocokkan"
                            : r.matchedId
                              ? "Cocok persis"
                              : "Tanggal & nominal sama"}
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            count={preview.rows.length}
            onChange={setPage}
            noun="baris"
          />
        </section>
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        busy={busy === "import"}
        title="Impor transaksi pilihan?"
        description={`${selected.length.toLocaleString("id-ID")} transaksi akan ditambahkan ke ${ledger.wallets.find((w) => w.id === mapping.walletId)?.name ?? "dompet pilihan"}. Catatan yang sudah ada tetap dipertahankan.`}
      >
        <p>
          {selected.filter((r) => r.duplicate).length} baris yang kamu pilih
          ditandai sebagai kemungkinan duplikat. {invalid} baris tidak valid
          tidak diimpor.
        </p>
        {stale && (
          <ErrorNotice>
            Data berubah. Tutup dan buat pratinjau ulang.
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
            className="button primary"
            disabled={Boolean(busy) || stale}
            onClick={() => void commit()}
          >
            {busy === "import" ? "Mengimpor…" : "Konfirmasi impor"}
          </button>
        </div>
      </Modal>
    </>
  );
}
