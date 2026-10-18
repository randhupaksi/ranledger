import { z } from "zod";
import { MAX_AMOUNT, MAX_ROWS, totals, validDate } from "./ledger";
import type { Category, Ledger } from "./ledger";

const idSchema = z
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
    date: dateSchema,
    note: z.string().max(500),
    createdAt: timeSchema,
    updatedAt: timeSchema,
  })
  .strict();
export const preferencesSchema = z
  .object({
    openingBalance: z.number().int().min(-MAX_AMOUNT).max(MAX_AMOUNT),
    theme: z.enum(["light", "dark", "system"]),
    dateFormat: z.enum(["long", "short"]),
    hideAmounts: z.boolean(),
    onboarded: z.boolean(),
    lastBackupAt: timeSchema.nullable(),
  })
  .strict();

export function validateLedger(ledger: Ledger): Ledger {
  if (ledger.transactions.length > MAX_ROWS || ledger.categories.length > 1000)
    throw new Error("Batas 100.000 transaksi atau 1.000 kategori terlampaui.");
  preferencesSchema.parse(ledger.preferences);
  const categoryMap = new Map<string, Category>();
  for (const category of ledger.categories) {
    categorySchema.parse(category);
    if (categoryMap.has(category.id))
      throw new Error("ID kategori ganda ditemukan di file.");
    categoryMap.set(category.id, category);
  }
  const ids = new Set<string>();
  for (const transaction of ledger.transactions) {
    transactionSchema.parse(transaction);
    if (ids.has(transaction.id))
      throw new Error("ID transaksi ganda ditemukan di file.");
    ids.add(transaction.id);
    const category = categoryMap.get(transaction.categoryId);
    if (!category || category.kind !== transaction.kind)
      throw new Error("Kategori transaksi hilang atau jenisnya tidak sesuai.");
  }
  totals(ledger.transactions, ledger.preferences.openingBalance);
  return ledger;
}
