import Dexie, { type Table } from "dexie";
import {
  defaultCategories,
  defaultPreferences,
  initialWallet,
  DEFAULT_WALLET_ID,
} from "../domain/ledger";
import type {
  Budget,
  Ledger,
  Preferences,
  RecurringSchedule,
  SavingsGoal,
  Transaction,
  Transfer,
  Wallet,
  Category,
} from "../domain/ledger";
import { canUseWallet, nextOccurrence } from "../domain/planning";
import type { Backup, ImportMode } from "./backup";

interface Meta {
  id: string;
  preferences: Preferences;
  revision: number;
}
export interface PlanningEntities {
  wallets: Wallet;
  transfers: Transfer;
  budgets: Budget;
  schedules: RecurringSchedule;
  goals: SavingsGoal;
}
export class LedgerDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  meta!: Table<Meta, string>;
  wallets!: Table<Wallet, string>;
  transfers!: Table<Transfer, string>;
  budgets!: Table<Budget, string>;
  schedules!: Table<RecurringSchedule, string>;
  goals!: Table<SavingsGoal, string>;
  constructor(name = "ranledger") {
    super(name);
    this.version(1).stores({
      transactions: "id,date,kind,categoryId,createdAt",
      categories: "id,kind",
      meta: "id",
    });
    this.version(2)
      .stores({
        transactions:
          "id,date,kind,categoryId,walletId,createdAt,&occurrenceKey",
        wallets: "id,type",
        transfers: "id,date,sourceWalletId,targetWalletId",
        budgets: "id,month,categoryId,walletId",
        schedules: "id,nextDate",
        goals: "id,walletId",
      })
      .upgrade(async (tx) => {
        const meta = await tx.table("meta").get("main");
        if (!meta)
          throw new Error(
            "Informasi penyimpanan lama tidak lengkap. Migrasi dibatalkan.",
          );
        const { openingBalance = 0, ...preferences } = meta.preferences;
        await tx.table("wallets").add(initialWallet(openingBalance));
        await tx
          .table("transactions")
          .toCollection()
          .modify({ walletId: DEFAULT_WALLET_ID });
        await tx
          .table("meta")
          .put({ ...meta, preferences, revision: (meta.revision ?? 0) + 1 });
      });
    this.on("populate", async (tx) => {
      await tx.table("categories").bulkAdd(defaultCategories);
      await tx.table("wallets").add(initialWallet());
      await tx
        .table("meta")
        .put({ id: "main", preferences: defaultPreferences, revision: 0 });
    });
  }
  async snapshot(): Promise<Ledger> {
    return this.transaction("r", this.tables, async () => {
      const [
        transactions,
        categories,
        wallets,
        transfers,
        budgets,
        schedules,
        goals,
        meta,
      ] = await Promise.all([
        this.transactions.toArray(),
        this.categories.toArray(),
        this.wallets.toArray(),
        this.transfers.toArray(),
        this.budgets.toArray(),
        this.schedules.toArray(),
        this.goals.toArray(),
        this.meta.get("main"),
      ]);
      if (!meta)
        throw new Error(
          "Informasi penyimpanan tidak lengkap. Jangan reset browser; pulihkan dari backup atau coba muat ulang.",
        );
      wallets.sort((a, b) =>
        a.id === DEFAULT_WALLET_ID
          ? -1
          : b.id === DEFAULT_WALLET_ID
            ? 1
            : a.name.localeCompare(b.name, "id-ID"),
      );
      return {
        transactions,
        categories,
        wallets,
        transfers,
        budgets,
        schedules,
        goals,
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
  private timestamp(previous?: string) {
    return new Date(
      Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0),
    ).toISOString();
  }
  private checkEdit(
    old: { updatedAt: string } | undefined,
    incoming: { updatedAt: string },
    isEdit: boolean,
  ) {
    if (isEdit && !old)
      throw new Error(
        "Catatan sudah dihapus di tab lain. Tutup formulir dan muat ulang daftar.",
      );
    if (isEdit && old?.updatedAt !== incoming.updatedAt)
      throw new Error(
        "Catatan berubah di tab lain. Buka kembali agar perubahan terbaru tidak tertimpa.",
      );
    if (!isEdit && old) throw new Error("ID catatan sudah digunakan.");
  }
  async saveTransaction(transaction: Transaction, isEdit: boolean) {
    const { transactionSchema, validateLedger } =
      await import("../domain/validation");
    transactionSchema.parse(transaction);
    await this.transaction("rw", this.tables, async () => {
      const current = await this.snapshot();
      const old = current.transactions.find((t) => t.id === transaction.id);
      this.checkEdit(old, transaction, isEdit);
      if (!old || old.walletId !== transaction.walletId)
        canUseWallet(
          current.wallets.find((w) => w.id === transaction.walletId),
        );
      const category = current.categories.find(
        (c) => c.id === transaction.categoryId,
      );
      if (
        (!old || old.categoryId !== transaction.categoryId) &&
        category?.archived
      )
        throw new Error("Pilih kategori aktif untuk catatan baru.");
      const next = {
        ...transaction,
        updatedAt: this.timestamp(old?.updatedAt),
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
    const { validateLedger } = await import("../domain/validation");
    await this.transaction("rw", this.tables, async () => {
      const old = await this.transactions.get(transaction.id);
      if (!old) throw new Error("Transaksi sudah dihapus di tab lain.");
      this.checkEdit(old, transaction, true);
      const current = await this.snapshot();
      validateLedger({
        ...current,
        transactions: current.transactions.filter(
          (t) => t.id !== transaction.id,
        ),
      });
      await this.transactions.delete(transaction.id);
      await this.bump();
    });
  }
  async saveCategory(category: Category) {
    const { categorySchema } = await import("../domain/validation");
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
    const { preferencesSchema } = await import("../domain/validation");
    await this.transaction("rw", this.tables, async () => {
      const meta = await this.meta.get("main");
      if (!meta) throw new Error("Informasi penyimpanan tidak ditemukan.");
      const preferences = preferencesSchema.parse({
        ...meta.preferences,
        ...values,
      });
      await this.meta.update("main", {
        preferences,
        revision: meta.revision + 1,
      });
    });
  }
  async saveEntity<K extends keyof PlanningEntities>(
    name: K,
    entity: PlanningEntities[K],
    isEdit: boolean,
  ) {
    const { validateLedger } = await import("../domain/validation");
    await this.transaction("rw", this.tables, async () => {
      const current = await this.snapshot();
      const table = this.table<PlanningEntities[K], string>(name);
      const old = await table.get(entity.id);
      this.checkEdit(old, entity, isEdit);
      const next = { ...entity, updatedAt: this.timestamp(old?.updatedAt) };
      if (name === "transfers") {
        const transfer = entity as Transfer;
        for (const id of [transfer.sourceWalletId, transfer.targetWalletId]) {
          const previous = old as Transfer | undefined;
          if (
            !previous ||
            (id !== previous.sourceWalletId && id !== previous.targetWalletId)
          )
            canUseWallet(current.wallets.find((w) => w.id === id));
        }
      }
      if (name === "schedules" && (entity as RecurringSchedule).active) {
        const schedule = entity as RecurringSchedule;
        canUseWallet(current.wallets.find((w) => w.id === schedule.walletId));
        if (
          current.categories.find((c) => c.id === schedule.categoryId)?.archived
        )
          throw new Error("Aktifkan kategori sebelum memakai jadwal ini.");
      }
      if (
        name === "wallets" &&
        (entity as Wallet).archived &&
        current.schedules.some((s) => s.active && s.walletId === entity.id)
      )
        throw new Error(
          "Jeda jadwal rutin dompet ini sebelum mengarsipkannya.",
        );
      validateLedger({
        ...current,
        [name]: [...current[name].filter((row) => row.id !== entity.id), next],
      });
      if (isEdit) await table.put(next);
      else await table.add(next);
      await this.bump();
    });
  }
  async removeEntity<K extends Exclude<keyof PlanningEntities, "wallets">>(
    name: K,
    entity: PlanningEntities[K],
  ) {
    const { validateLedger } = await import("../domain/validation");
    await this.transaction("rw", this.tables, async () => {
      const table = this.table<PlanningEntities[K], string>(name);
      const old = await table.get(entity.id);
      if (!old) throw new Error("Catatan sudah dihapus di tab lain.");
      this.checkEdit(old, entity, true);
      const current = await this.snapshot();
      validateLedger({
        ...current,
        [name]: current[name].filter((row) => row.id !== entity.id),
      });
      await table.delete(entity.id);
      await this.bump();
    });
  }
  async resolveSchedule(
    schedule: RecurringSchedule,
    action: "record" | "skip",
  ) {
    const { validateLedger } = await import("../domain/validation");
    await this.transaction("rw", this.tables, async () => {
      const current = await this.snapshot();
      const old = current.schedules.find((s) => s.id === schedule.id);
      this.checkEdit(old, schedule, true);
      if (!old?.active) throw new Error("Jadwal sedang dijeda.");
      const nextDate = nextOccurrence(old);
      const next = {
        ...old,
        nextDate,
        active: !old.endDate || nextDate <= old.endDate,
        updatedAt: this.timestamp(old.updatedAt),
      };
      let transactions = current.transactions;
      if (action === "record") {
        canUseWallet(current.wallets.find((w) => w.id === old.walletId));
        if (current.categories.find((c) => c.id === old.categoryId)?.archived)
          throw new Error(
            "Kategori jadwal diarsipkan. Ubah jadwal atau aktifkan kategorinya.",
          );
        const at = this.timestamp();
        transactions = [
          ...transactions,
          {
            id: crypto.randomUUID(),
            kind: old.kind,
            amount: old.amount,
            categoryId: old.categoryId,
            walletId: old.walletId,
            date: old.nextDate,
            note: old.name,
            createdAt: at,
            updatedAt: at,
            occurrenceKey: old.id + ":" + old.nextDate,
          },
        ];
      }
      validateLedger({
        ...current,
        transactions,
        schedules: current.schedules.map((s) => (s.id === old.id ? next : s)),
      });
      if (action === "record")
        await this.transactions.add(transactions[transactions.length - 1]);
      await this.schedules.put(next);
      await this.bump();
    });
  }
  async importTransactions(rows: Transaction[], expectedRevision: number) {
    const { validateLedger } = await import("../domain/validation");
    await this.transaction("rw", this.tables, async () => {
      const current = await this.snapshot();
      if (current.revision !== expectedRevision)
        throw new Error(
          "Data berubah. Perbarui pratinjau CSV sebelum mengimpor.",
        );
      const activeWallets = new Set(
        current.wallets.filter((w) => !w.archived).map((w) => w.id),
      );
      const activeCategories = new Set(
        current.categories.filter((c) => !c.archived).map((c) => c.id),
      );
      for (const row of rows) {
        if (!activeWallets.has(row.walletId))
          throw new Error("Pilih dompet aktif untuk impor CSV.");
        if (!activeCategories.has(row.categoryId))
          throw new Error("Pilih kategori aktif untuk impor CSV.");
      }
      validateLedger({
        ...current,
        transactions: [...current.transactions, ...rows],
      });
      await this.transactions.bulkAdd(rows);
      await this.bump();
    });
  }
  async restore(backup: Backup, mode: ImportMode, expectedRevision: number) {
    const [{ makeImportPlan }, { validateLedger }] = await Promise.all([
      import("./backup"),
      import("../domain/validation"),
    ]);
    return this.transaction("rw", this.tables, async () => {
      const current = await this.snapshot();
      if (current.revision !== expectedRevision)
        throw new Error(
          "Data berubah setelah pratinjau dibuat. Pilih ulang file untuk memeriksa dampaknya lagi.",
        );
      const plan = makeImportPlan(current, backup, mode);
      const next = validateLedger(plan.ledger);
      for (const name of [
        "transactions",
        "categories",
        "wallets",
        "transfers",
        "budgets",
        "schedules",
        "goals",
      ] as const) {
        const table = this[name] as Table<{ id: string }, string>;
        await table.clear();
        await table.bulkAdd(next[name]);
      }
      await this.meta.put({
        id: "main",
        preferences: next.preferences,
        revision: current.revision + 1,
      });
      const actual = await this.snapshot();
      const canonical = (ledger: Ledger) =>
        JSON.stringify({
          preferences: ledger.preferences,
          records: Object.fromEntries(
            (
              [
                "transactions",
                "categories",
                "wallets",
                "transfers",
                "budgets",
                "schedules",
                "goals",
              ] as const
            ).map((name) => [
              name,
              [...ledger[name]].sort((a, b) => a.id.localeCompare(b.id)),
            ]),
          ),
        });
      if (canonical(actual) !== canonical(next))
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
      for (const table of this.tables) await table.clear();
      await this.categories.bulkAdd(defaultCategories);
      await this.wallets.add(initialWallet());
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
