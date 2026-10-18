import { z } from "zod";
import { MAX_AMOUNT, MAX_ROWS, validDate } from "./ledger";
import type { Category, Ledger } from "./ledger";
import { ledgerTotals, walletBalances } from "./planning";

export const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const dateSchema = z.string().refine(validDate, "Tanggal tidak valid.");
const timeSchema = z.string().datetime({ offset: true });

export const categorySchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(60),
    kind: z.enum(["income", "expense"]),
    archived: z.boolean(),
  })
  .strict();
export const transactionSchema = z
  .object({
    id: idSchema,
    kind: z.enum(["income", "expense"]),
    amount: z.number().int().min(1).max(MAX_AMOUNT),
    categoryId: idSchema,
    walletId: idSchema,
    occurrenceKey: z.string().max(160).optional(),
    date: dateSchema,
    note: z.string().max(500),
    createdAt: timeSchema,
    updatedAt: timeSchema,
  })
  .strict();
export const preferencesSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]),
    dateFormat: z.enum(["long", "short"]),
    hideAmounts: z.boolean(),
    onboarded: z.boolean(),
    lastBackupAt: timeSchema.nullable(),
  })
  .strict();

const amountSchema = z.number().int().min(1).max(MAX_AMOUNT);
export const walletSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(60),
    type: z.enum(["cash", "bank", "ewallet", "savings"]),
    openingBalance: z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT),
    archived: z.boolean(),
    updatedAt: timeSchema,
  })
  .strict();
export const transferSchema = z
  .object({
    id: idSchema,
    sourceWalletId: idSchema,
    targetWalletId: idSchema,
    amount: amountSchema,
    date: dateSchema,
    note: z.string().max(500),
    createdAt: timeSchema,
    updatedAt: timeSchema,
  })
  .strict();
export const budgetSchema = z
  .object({
    id: idSchema,
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .refine((v) => validDate(v + "-01")),
    categoryId: idSchema,
    walletId: idSchema.nullable(),
    amount: amountSchema,
    updatedAt: timeSchema,
  })
  .strict();
export const scheduleSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(100),
    kind: z.enum(["income", "expense"]),
    amount: amountSchema,
    categoryId: idSchema,
    walletId: idSchema,
    frequency: z.enum(["weekly", "monthly", "yearly"]),
    nextDate: dateSchema,
    anchorDate: dateSchema,
    endDate: dateSchema.nullable(),
    active: z.boolean(),
    updatedAt: timeSchema,
  })
  .strict();
export const goalSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(100),
    walletId: idSchema,
    amount: amountSchema,
    targetDate: dateSchema,
    archived: z.boolean(),
    updatedAt: timeSchema,
  })
  .strict();

export function validateLedger(ledger: Ledger): Ledger {
  if (
    ledger.transactions.length + ledger.transfers.length > MAX_ROWS ||
    ledger.categories.length > 1000
  )
    throw new Error("Batas 100.000 transaksi atau 1.000 kategori terlampaui.");
  preferencesSchema.parse(ledger.preferences);
  for (const [rows, schema] of [
    [ledger.wallets, walletSchema],
    [ledger.transfers, transferSchema],
    [ledger.budgets, budgetSchema],
    [ledger.schedules, scheduleSchema],
    [ledger.goals, goalSchema],
  ] as const) {
    if (rows.length > (schema === transferSchema ? MAX_ROWS : 1000))
      throw new Error("Batas jumlah data perencanaan terlampaui.");
    const ids = new Set<string>();
    for (const row of rows) {
      schema.parse(row);
      if (ids.has(row.id)) throw new Error("ID ganda ditemukan di file.");
      ids.add(row.id);
    }
  }
  if (!ledger.wallets.length || !ledger.wallets.some((w) => !w.archived))
    throw new Error("Sediakan minimal satu dompet aktif.");
  const wallets = new Set(ledger.wallets.map((w) => w.id));
  const walletNames = new Set<string>();
  for (const w of ledger.wallets) {
    const key = w.name.trim().toLocaleLowerCase("id-ID");
    if (walletNames.has(key))
      throw new Error("Nama dompet harus berbeda, termasuk dompet arsip.");
    walletNames.add(key);
  }
  const categoryMap = new Map<string, Category>();
  for (const category of ledger.categories) {
    categorySchema.parse(category);
    if (categoryMap.has(category.id))
      throw new Error("ID kategori ganda ditemukan di file.");
    categoryMap.set(category.id, category);
  }
  const ids = new Set<string>();
  const occurrences = new Set<string>();
  for (const transaction of ledger.transactions) {
    transactionSchema.parse(transaction);
    if (ids.has(transaction.id))
      throw new Error("ID transaksi ganda ditemukan di file.");
    ids.add(transaction.id);
    if (!wallets.has(transaction.walletId))
      throw new Error("Dompet transaksi tidak ditemukan.");
    if (transaction.occurrenceKey) {
      if (occurrences.has(transaction.occurrenceKey))
        throw new Error("Kejadian jadwal ganda ditemukan.");
      occurrences.add(transaction.occurrenceKey);
    }
    const category = categoryMap.get(transaction.categoryId);
    if (!category || category.kind !== transaction.kind)
      throw new Error("Kategori transaksi hilang atau jenisnya tidak sesuai.");
  }
  for (const transfer of ledger.transfers) {
    if (
      !wallets.has(transfer.sourceWalletId) ||
      !wallets.has(transfer.targetWalletId) ||
      transfer.sourceWalletId === transfer.targetWalletId
    )
      throw new Error("Transfer memerlukan dua dompet yang berbeda dan valid.");
  }
  const budgetKeys = new Set<string>();
  for (const b of ledger.budgets) {
    if (
      categoryMap.get(b.categoryId)?.kind !== "expense" ||
      (b.walletId && !wallets.has(b.walletId))
    )
      throw new Error("Referensi anggaran tidak valid.");
    const key = `${b.month}:${b.categoryId}:${b.walletId ?? "*"}`;
    if (budgetKeys.has(key))
      throw new Error(
        "Anggaran kategori dan dompet untuk bulan ini sudah ada.",
      );
    budgetKeys.add(key);
  }
  for (const s of ledger.schedules) {
    if (
      !wallets.has(s.walletId) ||
      categoryMap.get(s.categoryId)?.kind !== s.kind
    )
      throw new Error("Referensi jadwal tidak valid.");
    if (
      s.nextDate < s.anchorDate ||
      (s.endDate && s.endDate < s.anchorDate) ||
      (s.active && s.endDate && s.nextDate > s.endDate)
    )
      throw new Error("Rentang tanggal jadwal tidak valid.");
  }
  const goalWallets = new Set<string>();
  for (const g of ledger.goals) {
    if (!wallets.has(g.walletId))
      throw new Error("Dompet tujuan tabungan tidak ditemukan.");
    if (!g.archived && goalWallets.has(g.walletId))
      throw new Error(
        "Satu dompet hanya dapat dihubungkan ke satu target aktif.",
      );
    if (!g.archived) goalWallets.add(g.walletId);
  }
  ledgerTotals(ledger);
  walletBalances(ledger);
  return ledger;
}
