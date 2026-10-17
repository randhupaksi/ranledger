import { z } from "zod";
import {
  categorySchema,
  transactionSchema,
  preferencesSchema,
  validateLedger,
  MAX_ROWS,
  emptyLedger,
  localDate,
  totals,
} from "../domain/ledger";
import type { Ledger, Transaction } from "../domain/ledger";

export const backupSchema = z
  .object({
    app: z.literal("ranledger"),
    formatVersion: z.literal(1),
    currency: z.literal("IDR"),
    exportedAt: z.string().datetime({ offset: true }),
    transactions: z.array(transactionSchema).max(MAX_ROWS),
    categories: z.array(categorySchema).max(1000),
    preferences: preferencesSchema,
  })
  .strict();
export type Backup = z.infer<typeof backupSchema>;
export type ImportMode = "merge" | "replace";
// JSON remains a recovery path for the maximum supported ledger, including long notes.
export const MAX_JSON_BYTES = 256 * 1024 * 1024;
export const MAX_EXCEL_BYTES = 32 * 1024 * 1024;
export function createBackup(
  ledger: Ledger,
  exportedAt = new Date().toISOString(),
): Backup {
  validateLedger(ledger);
  return backupSchema.parse({
    app: "ranledger",
    formatVersion: 1,
    currency: "IDR",
    exportedAt,
    transactions: ledger.transactions,
    categories: ledger.categories,
    preferences: ledger.preferences,
  });
}
export function parseBackup(value: unknown): Backup {
  const result = backupSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "File tidak sesuai format backup Ranledger versi 1. Pastikan file merupakan backup lengkap, bukan laporan transaksi.",
    );
  validateLedger({ ...result.data, revision: 0 });
  return result.data;
}
export function makeImportPlan(
  current: Ledger,
  backup: Backup,
  mode: ImportMode,
) {
  const checked = parseBackup(backup);
  const existing = new Map(current.transactions.map((t) => [t.id, t]));
  const duplicates = checked.transactions.filter((t) =>
    existing.has(t.id),
  ).length;
  const conflicts = checked.transactions.filter((t) => {
    const old = existing.get(t.id);
    return (
      old &&
      Object.keys(t).some(
        (key) => old[key as keyof Transaction] !== t[key as keyof Transaction],
      )
    );
  }).length;
  if (mode === "replace")
    return {
      ledger: validateLedger({
        transactions: checked.transactions,
        categories: checked.categories,
        preferences: checked.preferences,
        revision: current.revision,
      }),
      added: checked.transactions.length,
      duplicates,
      conflicts,
    };
  const categoryMap = new Map(current.categories.map((c) => [c.id, c]));
  const remap = new Map<string, string>();
  for (const category of checked.categories) {
    const local = categoryMap.get(category.id);
    if (local && local.kind !== category.kind)
      throw new Error(
        "Ada ID kategori dengan jenis berbeda. Gabung tidak aman; gunakan file lain atau pulihkan dengan opsi Ganti semua.",
      );
    if (local) {
      remap.set(category.id, local.id);
      continue;
    }
    const sameName = [...categoryMap.values()].find(
      (c) =>
        c.kind === category.kind &&
        c.name.toLocaleLowerCase() === category.name.toLocaleLowerCase(),
    );
    if (sameName) remap.set(category.id, sameName.id);
    else {
      categoryMap.set(category.id, category);
      remap.set(category.id, category.id);
    }
  }
  const additions = checked.transactions
    .filter((t) => !existing.has(t.id))
    .map((t) => ({ ...t, categoryId: remap.get(t.categoryId)! }));
  return {
    ledger: validateLedger({
      ...current,
      transactions: [...current.transactions, ...additions],
      categories: [...categoryMap.values()],
    }),
    added: additions.length,
    duplicates,
    conflicts,
  };
}

export async function backupToExcel(backup: Backup): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const sheets: [string, unknown[][]][] = [
    [
      "Ranledger",
      [
        ["app", "formatVersion", "currency", "exportedAt"],
        [backup.app, backup.formatVersion, backup.currency, backup.exportedAt],
      ],
    ],
    [
      "Transaksi",
      [
        [
          "id",
          "kind",
          "amount",
          "categoryId",
          "date",
          "note",
          "createdAt",
          "updatedAt",
        ],
        ...backup.transactions.map((t) => [
          t.id,
          t.kind,
          t.amount,
          t.categoryId,
          t.date,
          t.note,
          t.createdAt,
          t.updatedAt,
        ]),
      ],
    ],
    [
      "Kategori",
      [
        ["id", "name", "kind", "archived"],
        ...backup.categories.map((c) => [c.id, c.name, c.kind, c.archived]),
      ],
    ],
    [
      "Pengaturan",
      [
        Object.keys(backup.preferences),
        Object.values(backup.preferences).map((v) => (v === null ? "" : v)),
      ],
    ],
  ];
  for (const [name, rows] of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = rows[0].map((key) => ({ wch: key === "note" ? 50 : 26 }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    compression: true,
  }) as ArrayBuffer;
}
export async function excelToBackup(buffer: ArrayBuffer): Promise<Backup> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(buffer, {
    type: "array",
    cellFormula: true,
    cellHTML: false,
    cellDates: false,
    bookVBA: true,
    sheetRows: MAX_ROWS + 2,
  });
  if (book.vbaraw) throw new Error("File bermakro tidak didukung.");
  const expected: Record<string, string[]> = {
    Ranledger: ["app", "formatVersion", "currency", "exportedAt"],
    Transaksi: [
      "id",
      "kind",
      "amount",
      "categoryId",
      "date",
      "note",
      "createdAt",
      "updatedAt",
    ],
    Kategori: ["id", "name", "kind", "archived"],
    Pengaturan: Object.keys(emptyLedger().preferences),
  };
  const rows: Record<string, Record<string, unknown>[]> = {};
  for (const [name, headers] of Object.entries(expected)) {
    const sheet = book.Sheets[name];
    if (!sheet)
      throw new Error(
        `Lembar ${name} tidak ditemukan. Gunakan backup lengkap Ranledger.`,
      );
    const ref = sheet["!fullref"] ?? sheet["!ref"];
    if (ref && XLSX.utils.decode_range(ref).e.r > MAX_ROWS)
      throw new Error("File melebihi batas baris yang dapat diimpor.");
    for (const [key, cell] of Object.entries(sheet))
      if (
        !key.startsWith("!") &&
        typeof cell === "object" &&
        cell !== null &&
        "f" in cell
      )
        throw new Error(
          "Backup mengandung rumus Excel. Impor hanya menerima nilai biasa.",
        );
    const actual = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    })[0];
    if (!actual || JSON.stringify(actual) !== JSON.stringify(headers))
      throw new Error(`Kolom lembar ${name} tidak sesuai format backup.`);
    rows[name] = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true,
      defval: "",
    });
  }
  if (rows.Ranledger.length !== 1 || rows.Pengaturan.length !== 1)
    throw new Error("Metadata backup tidak lengkap atau berulang.");
  const preferences = {
    ...rows.Pengaturan[0],
    lastBackupAt: rows.Pengaturan[0].lastBackupAt || null,
  };
  return parseBackup({
    ...rows.Ranledger[0],
    transactions: rows.Transaksi,
    categories: rows.Kategori,
    preferences,
  });
}
export async function readBackupFile(file: File): Promise<Backup> {
  if (/\.json$/i.test(file.name)) {
    if (file.size > MAX_JSON_BYTES)
      throw new Error("Ukuran backup JSON maksimal 256 MB.");
    let value: unknown;
    try {
      value = JSON.parse(await file.text());
    } catch {
      throw new Error(
        "File JSON rusak atau tidak dapat dibaca. Pilih salinan backup lain.",
      );
    }
    return parseBackup(value);
  }
  if (/\.xlsx$/i.test(file.name)) {
    if (file.size > MAX_EXCEL_BYTES)
      throw new Error(
        "Ukuran backup Excel maksimal 32 MB. Gunakan backup JSON untuk catatan yang lebih besar.",
      );
    return excelToBackup(await file.arrayBuffer());
  }
  throw new Error("Pilih file backup .json atau .xlsx dari Ranledger.");
}
export function downloadFile(
  contents: BlobPart,
  filename: string,
  type: string,
) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function exportReport(
  transactions: Transaction[],
  ledger: Ledger,
  rangeLabel: string,
) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const total = totals(transactions);
  const rows = [
    ["Laporan transaksi Ranledger — bukan file backup"],
    [rangeLabel],
    ["Pemasukan", total.income],
    ["Pengeluaran", total.expense],
    ["Selisih", total.net],
    [],
    ["Tanggal", "Jenis", "Kategori", "Catatan", "Nominal (IDR)"],
    ...transactions.map((t) => [
      t.date,
      t.kind === "income" ? "Pemasukan" : "Pengeluaran",
      ledger.categories.find((c) => c.id === t.categoryId)?.name,
      t.note,
      t.amount,
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 20 },
    { wch: 25 },
    { wch: 50 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Laporan");
  const buffer = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    compression: true,
  }) as ArrayBuffer;
  downloadFile(
    buffer,
    `ranledger-laporan-${localDate()}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
export function exampleBackup(): Backup {
  const ledger = emptyLedger();
  const at = new Date().toISOString();
  const date = localDate();
  ledger.preferences.openingBalance = 500_000;
  ledger.transactions = [
    {
      id: "example-salary",
      kind: "income",
      amount: 2_500_000,
      categoryId: "salary",
      date,
      note: "Contoh: proyek desain",
      createdAt: at,
      updatedAt: at,
    },
    {
      id: "example-food",
      kind: "expense",
      amount: 35_000,
      categoryId: "food",
      date,
      note: "Contoh: makan siang",
      createdAt: at,
      updatedAt: at,
    },
    {
      id: "example-transport",
      kind: "expense",
      amount: 50_000,
      categoryId: "transport",
      date,
      note: "Contoh: bensin",
      createdAt: at,
      updatedAt: at,
    },
  ];
  return createBackup(ledger);
}
