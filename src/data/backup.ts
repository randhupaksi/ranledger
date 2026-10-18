import { z } from "zod";
import {
  MAX_AMOUNT,
  MAX_ROWS,
  emptyLedger,
  initialWallet,
  DEFAULT_WALLET_ID,
  localDate,
  totals,
} from "../domain/ledger";
import type { Ledger, Transaction } from "../domain/ledger";
import {
  categorySchema,
  preferencesSchema,
  transactionSchema,
  walletSchema,
  transferSchema,
  budgetSchema,
  scheduleSchema,
  goalSchema,
  validateLedger,
} from "../domain/validation";

const metadata = {
  app: z.literal("ranledger"),
  currency: z.literal("IDR"),
  exportedAt: z.string().datetime({ offset: true }),
};
export const backupSchema = z
  .object({
    ...metadata,
    formatVersion: z.literal(2),
    transactions: z.array(transactionSchema).max(MAX_ROWS),
    categories: z.array(categorySchema).max(1000),
    preferences: preferencesSchema,
    wallets: z.array(walletSchema).max(1000),
    transfers: z.array(transferSchema).max(MAX_ROWS),
    budgets: z.array(budgetSchema).max(1000),
    schedules: z.array(scheduleSchema).max(1000),
    goals: z.array(goalSchema).max(1000),
  })
  .strict();
const legacySchema = z
  .object({
    ...metadata,
    formatVersion: z.literal(1),
    transactions: z
      .array(transactionSchema.omit({ walletId: true, occurrenceKey: true }))
      .max(MAX_ROWS),
    categories: z.array(categorySchema).max(1000),
    preferences: preferencesSchema
      .extend({
        openingBalance: z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT),
      })
      .strict(),
  })
  .strict();
export interface Backup extends Omit<Ledger, "revision"> {
  app: "ranledger";
  formatVersion: 2;
  currency: "IDR";
  exportedAt: string;
}
export type ImportMode = "merge" | "replace";
export const MAX_JSON_BYTES = 256 * 1024 * 1024;
export const MAX_EXCEL_BYTES = 32 * 1024 * 1024;
export function createBackup(
  ledger: Ledger,
  exportedAt = new Date().toISOString(),
): Backup {
  validateLedger(ledger);
  const { revision: _revision, ...data } = ledger;
  return backupSchema.parse({
    ...data,
    app: "ranledger",
    formatVersion: 2,
    currency: "IDR",
    exportedAt,
  });
}
export function parseBackup(value: unknown): Backup {
  const version =
    value && typeof value === "object" && "formatVersion" in value
      ? value.formatVersion
      : undefined;
  let input = value;
  if (version === 1) {
    const legacy = legacySchema.safeParse(value);
    if (!legacy.success)
      throw new Error("File backup Ranledger versi 1 tidak valid.");
    const { openingBalance, ...preferences } = legacy.data.preferences;
    input = {
      ...legacy.data,
      formatVersion: 2,
      preferences,
      transactions: legacy.data.transactions.map((t) => ({
        ...t,
        walletId: DEFAULT_WALLET_ID,
      })),
      wallets: [initialWallet(openingBalance)],
      transfers: [],
      budgets: [],
      schedules: [],
      goals: [],
    };
  }
  const result = backupSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      "File tidak sesuai format backup Ranledger versi 1 atau 2. Gunakan backup lengkap, bukan laporan transaksi.",
    );
  validateLedger({ ...result.data, revision: 0 });
  return result.data;
}
function different(a: object, b: object) {
  return JSON.stringify(a) !== JSON.stringify(b);
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
  const conflicts = checked.transactions.filter(
    (t) => existing.has(t.id) && different(existing.get(t.id)!, t),
  ).length;
  const entityNames = [
    "wallets",
    "transfers",
    "budgets",
    "schedules",
    "goals",
  ] as const;
  if (mode === "replace") {
    const {
      app: _app,
      formatVersion: _version,
      currency: _currency,
      exportedAt: _date,
      ...data
    } = checked;
    return {
      ledger: validateLedger({ ...data, revision: current.revision }),
      added: checked.transactions.length,
      duplicates,
      conflicts,
      features: Object.fromEntries(
        entityNames.map((name) => [name, checked[name].length]),
      ) as Record<(typeof entityNames)[number], number>,
    };
  }
  const categoryMap = new Map(current.categories.map((c) => [c.id, c]));
  const categoryRemap = new Map<string, string>();
  for (const category of checked.categories) {
    const local = categoryMap.get(category.id);
    if (local && local.kind !== category.kind)
      throw new Error(
        "Ada ID kategori dengan jenis berbeda. Gabung tidak aman.",
      );
    const same =
      local ??
      [...categoryMap.values()].find(
        (c) =>
          c.kind === category.kind &&
          c.name.toLocaleLowerCase("id-ID") ===
            category.name.toLocaleLowerCase("id-ID"),
      );
    if (same) categoryRemap.set(category.id, same.id);
    else {
      categoryMap.set(category.id, category);
      categoryRemap.set(category.id, category.id);
    }
  }
  const walletMap = new Map(current.wallets.map((w) => [w.id, w]));
  const walletRemap = new Map<string, string>();
  for (const wallet of checked.wallets) {
    const local =
      walletMap.get(wallet.id) ??
      [...walletMap.values()].find(
        (w) =>
          w.name.toLocaleLowerCase("id-ID") ===
          wallet.name.toLocaleLowerCase("id-ID"),
      );
    if (local) walletRemap.set(wallet.id, local.id);
    else {
      walletMap.set(wallet.id, wallet);
      walletRemap.set(wallet.id, wallet.id);
    }
  }
  const occurrenceKeys = new Set(
    current.transactions.flatMap((t) =>
      t.occurrenceKey ? [t.occurrenceKey] : [],
    ),
  );
  const additions = checked.transactions
    .filter(
      (t) =>
        !existing.has(t.id) &&
        (!t.occurrenceKey || !occurrenceKeys.has(t.occurrenceKey)),
    )
    .map((t) => ({
      ...t,
      categoryId: categoryRemap.get(t.categoryId)!,
      walletId: walletRemap.get(t.walletId)!,
    }));
  const mergeById = <T extends { id: string }>(a: T[], b: T[]) => {
    const ids = new Set(a.map((row) => row.id));
    return [...a, ...b.filter((row) => !ids.has(row.id))];
  };
  const transfers = mergeById(
    current.transfers,
    checked.transfers.map((t) => ({
      ...t,
      sourceWalletId: walletRemap.get(t.sourceWalletId)!,
      targetWalletId: walletRemap.get(t.targetWalletId)!,
    })),
  );
  const budgets = [...current.budgets];
  for (const b of checked.budgets) {
    const next = {
      ...b,
      categoryId: categoryRemap.get(b.categoryId)!,
      walletId: b.walletId ? walletRemap.get(b.walletId)! : null,
    };
    if (
      !budgets.some(
        (old) =>
          old.id === next.id ||
          (old.month === next.month &&
            old.categoryId === next.categoryId &&
            old.walletId === next.walletId),
      )
    )
      budgets.push(next);
  }
  const schedules = mergeById(
    current.schedules,
    checked.schedules.map((s) => ({
      ...s,
      walletId: walletRemap.get(s.walletId)!,
      categoryId: categoryRemap.get(s.categoryId)!,
    })),
  );
  const goals = [...current.goals];
  for (const g of checked.goals) {
    const next = { ...g, walletId: walletRemap.get(g.walletId)! };
    if (
      !goals.some(
        (old) =>
          old.id === next.id ||
          (!old.archived && !next.archived && old.walletId === next.walletId),
      )
    )
      goals.push(next);
  }
  const ledger = validateLedger({
    ...current,
    transactions: [...current.transactions, ...additions],
    categories: [...categoryMap.values()],
    wallets: [...walletMap.values()],
    transfers,
    budgets,
    schedules,
    goals,
  });
  return {
    ledger,
    added: additions.length,
    duplicates,
    conflicts,
    features: Object.fromEntries(
      entityNames.map((name) => [
        name,
        ledger[name].length - current[name].length,
      ]),
    ) as Record<(typeof entityNames)[number], number>,
  };
}
const transactionHeaders = [
  "id",
  "kind",
  "amount",
  "categoryId",
  "date",
  "note",
  "createdAt",
  "updatedAt",
];
const sheetFields = {
  Transaksi: [...transactionHeaders, "walletId", "occurrenceKey"],
  Kategori: ["id", "name", "kind", "archived"],
  Dompet: ["id", "name", "type", "openingBalance", "archived", "updatedAt"],
  Transfer: [
    "id",
    "sourceWalletId",
    "targetWalletId",
    "amount",
    "date",
    "note",
    "createdAt",
    "updatedAt",
  ],
  Anggaran: ["id", "month", "categoryId", "walletId", "amount", "updatedAt"],
  Jadwal: [
    "id",
    "name",
    "kind",
    "amount",
    "categoryId",
    "walletId",
    "frequency",
    "nextDate",
    "anchorDate",
    "endDate",
    "active",
    "updatedAt",
  ],
  Tujuan: [
    "id",
    "name",
    "walletId",
    "amount",
    "targetDate",
    "archived",
    "updatedAt",
  ],
};
export async function backupToExcel(backup: Backup): Promise<ArrayBuffer> {
  const checked = parseBackup(backup);
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const append = (name: string, headers: string[], rows: object[]) => {
    const sheet = XLSX.utils.aoa_to_sheet([
      headers,
      ...rows.map((row) =>
        headers.map((key) => (row as Record<string, unknown>)[key] ?? ""),
      ),
    ]);
    sheet["!cols"] = headers.map((key) => ({ wch: key === "note" ? 50 : 26 }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };
  append(
    "Ranledger",
    ["app", "formatVersion", "currency", "exportedAt"],
    [checked],
  );
  append("Transaksi", sheetFields.Transaksi, checked.transactions);
  append("Kategori", sheetFields.Kategori, checked.categories);
  append("Pengaturan", Object.keys(checked.preferences), [checked.preferences]);
  append("Dompet", sheetFields.Dompet, checked.wallets);
  append("Transfer", sheetFields.Transfer, checked.transfers);
  append("Anggaran", sheetFields.Anggaran, checked.budgets);
  append("Jadwal", sheetFields.Jadwal, checked.schedules);
  append("Tujuan", sheetFields.Tujuan, checked.goals);
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
  function read(name: string, headers: string[]) {
    const sheet = book.Sheets[name];
    if (!sheet)
      throw new Error(
        "Lembar " +
          name +
          " tidak ditemukan. Gunakan backup lengkap Ranledger.",
      );
    const ref = sheet["!fullref"] ?? sheet["!ref"];
    if (ref && XLSX.utils.decode_range(ref).e.r > MAX_ROWS)
      throw new Error("File melebihi batas baris yang dapat diimpor.");
    for (const [key, cell] of Object.entries(sheet)) {
      if (
        !key.startsWith("!") &&
        typeof cell === "object" &&
        cell !== null &&
        "f" in cell
      )
        throw new Error(
          "Backup mengandung rumus Excel. Impor hanya menerima nilai biasa.",
        );
    }
    const actual = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    })[0];
    if (JSON.stringify(actual) !== JSON.stringify(headers))
      throw new Error("Kolom lembar " + name + " tidak sesuai format backup.");
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: true,
      defval: "",
    });
  }
  const meta = read("Ranledger", [
    "app",
    "formatVersion",
    "currency",
    "exportedAt",
  ]);
  if (meta.length !== 1)
    throw new Error("Metadata backup tidak lengkap atau berulang.");
  const legacy = meta[0].formatVersion === 1;
  const settings = read(
    "Pengaturan",
    legacy
      ? ["openingBalance", ...Object.keys(emptyLedger().preferences)]
      : Object.keys(emptyLedger().preferences),
  );
  if (settings.length !== 1)
    throw new Error("Pengaturan backup tidak lengkap atau berulang.");
  const transactions = read(
    "Transaksi",
    legacy ? transactionHeaders : sheetFields.Transaksi,
  ).map((row) => {
    if (!row.occurrenceKey) delete row.occurrenceKey;
    return row;
  });
  const base = {
    ...meta[0],
    transactions,
    categories: read("Kategori", sheetFields.Kategori),
    preferences: {
      ...settings[0],
      lastBackupAt: settings[0].lastBackupAt || null,
    },
  };
  return parseBackup(
    legacy
      ? base
      : {
          ...base,
          wallets: read("Dompet", sheetFields.Dompet),
          transfers: read("Transfer", sheetFields.Transfer),
          budgets: read("Anggaran", sheetFields.Anggaran).map((row) => ({
            ...row,
            walletId: row.walletId || null,
          })),
          schedules: read("Jadwal", sheetFields.Jadwal).map((row) => ({
            ...row,
            endDate: row.endDate || null,
          })),
          goals: read("Tujuan", sheetFields.Tujuan),
        },
  );
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
        "Ukuran backup Excel maksimal 32 MB. Gunakan JSON untuk catatan besar.",
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
  const categories = new Map(ledger.categories.map((c) => [c.id, c.name]));
  const wallets = new Map(ledger.wallets.map((w) => [w.id, w.name]));
  const rows = [
    ["Laporan transaksi Ranledger — bukan file backup"],
    [rangeLabel],
    ["Pemasukan", total.income],
    ["Pengeluaran", total.expense],
    ["Selisih", total.net],
    [],
    ["Tanggal", "Jenis", "Kategori", "Catatan", "Nominal (IDR)", "Dompet"],
    ...transactions.map((t) => [
      t.date,
      t.kind === "income" ? "Pemasukan" : "Pengeluaran",
      categories.get(t.categoryId),
      t.note,
      t.amount,
      wallets.get(t.walletId),
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 20 },
    { wch: 25 },
    { wch: 50 },
    { wch: 22 },
    { wch: 26 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Laporan");
  downloadFile(
    XLSX.write(workbook, {
      type: "array",
      bookType: "xlsx",
      compression: true,
    }) as ArrayBuffer,
    "ranledger-laporan-" + localDate() + ".xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
export function exampleBackup(): Backup {
  const ledger = emptyLedger();
  const at = new Date().toISOString();
  const date = localDate();
  ledger.wallets[0].openingBalance = 500_000;
  ledger.transactions = [
    {
      id: "example-salary",
      kind: "income",
      amount: 2_500_000,
      categoryId: "salary",
      walletId: DEFAULT_WALLET_ID,
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
      walletId: DEFAULT_WALLET_ID,
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
      walletId: DEFAULT_WALLET_ID,
      date,
      note: "Contoh: bensin",
      createdAt: at,
      updatedAt: at,
    },
  ];
  return createBackup(ledger);
}
