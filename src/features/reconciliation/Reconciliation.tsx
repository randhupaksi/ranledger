import { useState } from "react";
import { Link } from "react-router";
import { useLedger } from "../../components/LedgerProvider";
import { EditorDialog } from "../../components/EditorDialog";
import { PageHeading } from "../../components/ui";
import { SelectField } from "../../components/SelectField";
import { db } from "../../data/database";
import type { CategoryRule, ImportBatch } from "../../domain/ledger";
function RuleEditor({
  rule,
  onClose,
}: {
  rule?: CategoryRule;
  onClose: () => void;
}) {
  const ledger = useLedger();
  const [text, setText] = useState(rule?.contains ?? ""),
    [kind, setKind] = useState<"income" | "expense">(rule?.kind ?? "expense"),
    [category, setCategory] = useState(
      rule?.categoryId ??
        ledger.categories.find((c) => c.kind === "expense" && !c.archived)
          ?.id ??
        "",
    ),
    [enabled, setEnabled] = useState(rule?.enabled ?? true);
  return (
    <EditorDialog
      title={rule ? "Ubah aturan kategori" : "Aturan kategori baru"}
      description="Aturan diterapkan pada pratinjau CSV. Riwayat yang sudah dicatat tidak diubah."
      onClose={onClose}
      onDelete={rule ? () => db.removeEntity("rules", rule) : undefined}
      onSave={() =>
        db.saveEntity(
          "rules",
          {
            id: rule?.id ?? crypto.randomUUID(),
            contains: text.trim(),
            kind,
            categoryId: category,
            enabled,
            updatedAt: rule?.updatedAt ?? new Date().toISOString(),
          },
          Boolean(rule),
        )
      }
    >
      <div className="field">
        <label htmlFor="rule-text">Keterangan mengandung</label>
        <input
          id="rule-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={100}
          placeholder="Misalnya, supermarket"
        />
      </div>
      <div className="field">
        <label htmlFor="rule-kind">Jenis transaksi aturan</label>
        <SelectField
          id="rule-kind"
          value={kind}
          onValueChange={(v) => {
            setKind(v as typeof kind);
            setCategory(
              ledger.categories.find((c) => c.kind === v && !c.archived)?.id ??
                "",
            );
          }}
          options={[
            { value: "expense", label: "Pengeluaran" },
            { value: "income", label: "Pemasukan" },
          ]}
        />
      </div>
      <div className="field">
        <label htmlFor="rule-category">Kategori hasil aturan</label>
        <SelectField
          id="rule-category"
          value={category}
          onValueChange={setCategory}
          options={ledger.categories
            .filter((c) => c.kind === kind && !c.archived)
            .map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Aktifkan aturan
      </label>
      <p className="field-hint">
        Jika beberapa aturan cocok, aturan pertama dalam daftar dipakai. Periksa
        hasil sebelum impor.
      </p>
    </EditorDialog>
  );
}
export default function Reconciliation() {
  const ledger = useLedger(),
    [rule, setRule] = useState<CategoryRule | "new" | null>(null),
    [undo, setUndo] = useState<ImportBatch | null>(null);
  const batches = [...ledger.importBatches].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <>
      <PageHeading
        eyebrow="LANJUTAN ALUR IMPOR"
        title="Riwayat impor & aturan"
        description="Tinjau transaksi dari CSV, batalkan batch yang belum berubah, dan atur kategori untuk impor berikutnya."
        action={
          <Link to="/impor" className="button primary">
            Impor transaksi CSV
          </Link>
        }
      />
      <section className="v3-section">
        <h2>Batch impor</h2>
        <p className="field-hint">
          Membatalkan batch menghapus transaksi yang dibuat batch itu. Transaksi
          yang hanya dicocokkan tetap tersimpan. Pembatalan ditolak jika salah
          satu transaksi impor sudah diubah atau dihapus.
        </p>
        {!batches.length ? (
          <div className="v3-empty">
            <h3>Belum ada batch impor</h3>
            <p>Riwayat dan pencocokan akan muncul setelah CSV dikonfirmasi.</p>
          </div>
        ) : (
          <div className="v3-register">
            {batches.map((batch) => (
              <div className="v3-row" key={batch.id}>
                <div>
                  <strong>{batch.name}</strong>
                  <small>
                    {new Date(batch.createdAt).toLocaleString("id-ID")} ·{" "}
                    {batch.transactionIds.length} transaksi baru ·{" "}
                    {batch.matches?.length ?? 0} dicocokkan
                    {batch.undoneAt ? " · Dibatalkan" : ""}
                  </small>
                </div>
                <button
                  className="button text-danger"
                  disabled={Boolean(batch.undoneAt)}
                  onClick={() => setUndo(batch)}
                >
                  Batalkan batch
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="v3-section">
        <div className="section-heading">
          <div>
            <h2>Aturan kategori</h2>
            <p>
              Keterangan yang cocok mengisi kategori di pratinjau, lalu kamu
              tetap memeriksa hasilnya.
            </p>
          </div>
          <button className="button secondary" onClick={() => setRule("new")}>
            Tambah aturan
          </button>
        </div>
        <div className="v3-register">
          {ledger.rules.map((r) => (
            <button
              className="v3-row v3-text-button full-width"
              key={r.id}
              onClick={() => setRule(r)}
            >
              <div>
                <strong>Mengandung “{r.contains}”</strong>
                <small>
                  {ledger.categories.find((c) => c.id === r.categoryId)?.name} ·{" "}
                  {r.enabled ? "Aktif" : "Dijeda"}
                </small>
              </div>
              <span>Ubah</span>
            </button>
          ))}
        </div>
      </section>
      {rule && (
        <RuleEditor
          rule={rule === "new" ? undefined : rule}
          onClose={() => setRule(null)}
        />
      )}{" "}
      {undo && (
        <EditorDialog
          title="Batalkan batch impor"
          description={`${undo.transactionIds.length} transaksi impor dari ${undo.name} akan dihapus jika seluruhnya belum berubah. Pencocokan tidak menghapus transaksi asli.`}
          onClose={() => setUndo(null)}
          saveLabel="Batalkan batch"
          onSave={() => db.undoImport(undo.id)}
        >
          <p>Riwayat batch tetap disimpan dengan status dibatalkan.</p>
        </EditorDialog>
      )}
    </>
  );
}
