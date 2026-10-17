import Dexie, { type Table } from "dexie";
import {
  defaultCategories,
  defaultPreferences,
  validateLedger,
  totals,
  transactionSchema,
  categorySchema,
  preferencesSchema,
} from "../domain/ledger";
import type {
  Category,
  Ledger,
  Preferences,
  Transaction,
} from "../domain/ledger";
import { makeImportPlan, type Backup, type ImportMode } from "./backup";

interface Meta {
  id: string;
  preferences: Preferences;
  revision: number;
}
export class LedgerDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  meta!: Table<Meta, string>;
  constructor(name = "ranledger") {
    super(name);
    this.version(1).stores({
      transactions: "id,date,kind,categoryId,createdAt",
      categories: "id,kind",
      meta: "id",
    });
    this.on("populate", async (tx) => {
      await tx.table("categories").bulkAdd(defaultCategories);
      await tx
        .table("meta")
        .put({ id: "main", preferences: defaultPreferences, revision: 0 });
    });
  }
  async snapshot(): Promise<Ledger> {
    return this.transaction("r", this.tables, async () => {
      const [transactions, categories, meta] = await Promise.all([
        this.transactions.toArray(),
        this.categories.toArray(),
        this.meta.get("main"),
      ]);
      if (!meta)
        throw new Error(
          "Informasi penyimpanan tidak lengkap. Jangan reset browser; pulihkan dari backup atau coba muat ulang.",
        );
      return {
        transactions,
        categories,
        preferences: meta.preferences,
        revision: meta.revision,
      };
    });
  }
  private async bump() {
    const meta = await this.meta.get("main");
    if (!meta) throw new Error("Informasi penyimpanan tidak ditemukan.");
    await this.meta.update("main", { revision: meta.revision + 1 });
  }
  async saveTransaction(transaction: Transaction, isEdit: boolean) {
    transactionSchema.parse(transaction);
    await this.transaction("rw", this.tables, async () => {
      const current = await this.snapshot();
      const old = current.transactions.find((t) => t.id === transaction.id);
      if (isEdit && !old)
        throw new Error(
          "Transaksi sudah dihapus di tab lain. Tutup formulir dan muat ulang daftar.",
        );
      if (isEdit && old && old.updatedAt !== transaction.updatedAt)
        throw new Error(
          "Transaksi berubah di tab lain. Buka kembali catatan agar perubahan terbaru tidak tertimpa.",
        );
      const next = {
        ...transaction,
        updatedAt: new Date(
          Math.max(
            Date.now(),
            old ? Date.parse(old.updatedAt) + 1 : Date.now(),
          ),
        ).toISOString(),
      };
      validateLedger({
        ...current,
        transactions: [
          ...current.transactions.filter((t) => t.id !== next.id),
          next,
        ],
      });
      if (isEdit) await this.transactions.put(next);
      else await this.transactions.add(next);
      await this.bump();
    });
  }
  async removeTransaction(transaction: Transaction) {
    await this.transaction("rw", this.tables, async () => {
      const old = await this.transactions.get(transaction.id);
      if (old && old.updatedAt !== transaction.updatedAt)
        throw new Error(
          "Transaksi berubah di tab lain. Buka kembali sebelum menghapus.",
        );
      await this.transactions.delete(transaction.id);
      await this.bump();
    });
  }
  async saveCategory(category: Category) {
    categorySchema.parse(category);
    await this.transaction("rw", this.tables, async () => {
      const categories = await this.categories.toArray();
      if (
        categories.length >= 1000 &&
        !categories.some((c) => c.id === category.id)
      )
        throw new Error("Maksimal 1.000 kategori.");
      if (
        categories.some(
          (c) =>
            c.id !== category.id &&
            c.kind === category.kind &&
            c.name.toLocaleLowerCase() ===
              category.name.trim().toLocaleLowerCase(),
        )
      )
        throw new Error(
          "Kategori dengan nama dan jenis yang sama sudah ada, termasuk yang diarsipkan.",
        );
      const old = categories.find((c) => c.id === category.id);
      if (old && old.kind !== category.kind)
        throw new Error("Jenis kategori yang sudah ada tidak dapat diubah.");
      await this.categories.put({ ...category, name: category.name.trim() });
      await this.bump();
    });
  }
  async updatePreferences(values: Partial<Preferences>) {
    await this.transaction("rw", this.tables, async () => {
      const current = await this.snapshot();
      const preferences = preferencesSchema.parse({
        ...current.preferences,
        ...values,
      });
      totals(current.transactions, preferences.openingBalance);
      await this.meta.update("main", {
        preferences,
        revision: current.revision + 1,
      });
    });
  }
  async restore(backup: Backup, mode: ImportMode, expectedRevision: number) {
    return this.transaction("rw", this.tables, async () => {
      const current = await this.snapshot();
      if (current.revision !== expectedRevision)
        throw new Error(
          "Data berubah setelah pratinjau dibuat. Pilih ulang file untuk memeriksa dampaknya lagi.",
        );
      const plan = makeImportPlan(current, backup, mode);
      const next = validateLedger(plan.ledger);
      await this.transactions.clear();
      await this.categories.clear();
      await this.transactions.bulkAdd(next.transactions);
      await this.categories.bulkAdd(next.categories);
      await this.meta.put({
        id: "main",
        preferences: next.preferences,
        revision: current.revision + 1,
      });
      const actual = await this.snapshot();
      const byId = <T extends { id: string }>(rows: T[]) =>
        [...rows].sort((a, b) => a.id.localeCompare(b.id));
      if (
        JSON.stringify(byId(actual.transactions)) !==
          JSON.stringify(byId(next.transactions)) ||
        JSON.stringify(byId(actual.categories)) !==
          JSON.stringify(byId(next.categories)) ||
        JSON.stringify(actual.preferences) !== JSON.stringify(next.preferences)
      )
        throw new Error(
          "Pemeriksaan pemulihan gagal. Seluruh perubahan dibatalkan.",
        );
      return plan;
    });
  }
  async reset(expectedRevision: number) {
    await this.transaction("rw", this.tables, async () => {
      const current = await this.snapshot();
      if (current.revision !== expectedRevision)
        throw new Error(
          "Data berubah di tab lain. Tutup konfirmasi dan periksa data sebelum reset.",
        );
      await this.transactions.clear();
      await this.categories.clear();
      await this.categories.bulkAdd(defaultCategories);
      await this.meta.put({
        id: "main",
        preferences: {
          ...defaultPreferences,
          theme: current.preferences.theme,
          onboarded: true,
        },
        revision: current.revision + 1,
      });
    });
  }
}
export const db = new LedgerDatabase();
