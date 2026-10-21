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
import { canonical } from "../domain/serialization";
import {
  entityNames,
  journalEntries,
  type JournalEntry,
} from "../domain/finance";
import type {
  LiabilityTerms,
  ImportBatch,
  CategoryRule,
} from "../domain/ledger";

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
  liabilities: LiabilityTerms;
  importBatches: ImportBatch;
  rules: CategoryRule;
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
  liabilities!: Table<LiabilityTerms, string>;
  importBatches!: Table<ImportBatch, string>;
  rules!: Table<CategoryRule, string>;
  journal!: Table<JournalEntry, string>;
  syncState!: Table<{ id: string; value: unknown }, string>;
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
    this.version(3)
      .stores({
        liabilities: "id,&walletId",
        importBatches: "id,createdAt",
        rules: "id,kind",
        journal: "id,date",
        syncState: "id",
        transactions:
          "id,date,kind,categoryId,walletId,createdAt,&occurrenceKey,[walletId+date],[kind+date]",
      })
      .upgrade(async (tx) => {
        const [transactions, wallets, transfers] = await Promise.all([
          tx.table("transactions").toArray(),
          tx.table("wallets").toArray(),
          tx.table("transfers").toArray(),
        ]);
        const [categories, budgets, schedules, goals, meta] = await Promise.all(
          [
            tx.table("categories").toArray(),
            tx.table("budgets").toArray(),
            tx.table("schedules").toArray(),
            tx.table("goals").toArray(),
            tx.table("meta").get("main"),
          ],
        );
        if (!meta)
          throw new Error(
            "Metadata ledger lama tidak lengkap. Upgrade dibatalkan.",
          );
        await tx.table("syncState").put({
          id: "preV3Backup",
          value: {
            app: "ranledger",
            formatVersion: 2,
            currency: "IDR",
            exportedAt: new Date().toISOString(),
            transactions,
            wallets,
            transfers,
            categories,
            budgets,
            schedules,
            goals,
            preferences: meta.preferences,
          },
        });
        await tx
          .table("journal")
          .bulkPut(
            journalEntries({ transactions, wallets, transfers } as Ledger),
          );
      });
    let projectionReady = false;
    this.on("ready", () => {
      projectionReady = true;
    });
    for (const name of ["transactions", "wallets", "transfers"] as const) {
      const project = (row: unknown) => {
        const source = {
          transactions: [],
          wallets: [],
          transfers: [],
          [name]: [row],
        } as unknown as Ledger;
        return journalEntries(source)[0];
      };
      this.table(name).hook("creating", (_key, row, tx) => {
        if (projectionReady && tx.storeNames.includes("journal"))
          void tx.table("journal").put(project(row));
      });
      this.table(name).hook("updating", (mods, key, row, tx) => {
        if (projectionReady && tx.storeNames.includes("journal"))
          void tx.table("journal").put(project({ ...row, ...mods, id: key }));
      });
      this.table(name).hook("deleting", (key, _row, tx) => {
        if (projectionReady && tx.storeNames.includes("journal"))
          void tx
            .table("journal")
            .delete(
              `${name === "wallets" ? "opening" : name === "transfers" ? "transfer" : "transaction"}_${key}`,
            );
      });
    }
    this.on("populate", async (tx) => {
      await tx.table("categories").bulkAdd(defaultCategories);
      await tx.table("wallets").add(initialWallet());
      await tx.table("journal").bulkPut(
        journalEntries({
          wallets: [initialWallet()],
          transactions: [],
          transfers: [],
        } as unknown as Ledger),
      );
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
        liabilities,
        importBatches,
        rules,
        meta,
      ] = await Promise.all([
        this.transactions.toArray(),
        this.categories.toArray(),
        this.wallets.toArray(),
        this.transfers.toArray(),
        this.budgets.toArray(),
        this.schedules.toArray(),
        this.goals.toArray(),
        this.liabilities.toArray(),
        this.importBatches.toArray(),
        this.rules.toArray(),
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
        liabilities,
        importBatches,
        rules,
        preferences: meta.preferences,
        revision: meta.revision,
      };
    });
  }
  private async bump() {
    const access = await this.syncState.get("access");
    if (access?.value === "viewer" || access?.value === "revoked")
      throw new Error("Ruang ini hanya dapat dibaca atau akses telah dicabut.");
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
      if (name === "wallets" && old) {
        const a = old as Wallet,
          b = entity as Wallet;
        const liability = (type: string) =>
          ["credit", "paylater", "loan"].includes(type);
        if (
          liability(a.type) !== liability(b.type) &&
          (current.transactions.some((t) => t.walletId === a.id) ||
            current.transfers.some(
              (t) => t.sourceWalletId === a.id || t.targetWalletId === a.id,
            ))
        )
          throw new Error(
            "Akun yang sudah memiliki riwayat tidak dapat diubah antara aset dan kewajiban. Buat akun baru.",
          );
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
  async removeWallet(wallet: Wallet, expectedRevision: number) {
    const { validateLedger } = await import("../domain/validation");
    await this.transaction("rw", this.tables, async () => {
      const current = await this.snapshot();
      const old = current.wallets.find((row) => row.id === wallet.id);
      this.checkEdit(old, wallet, true);
      if (current.revision !== expectedRevision)
        throw new Error(
          "Data berubah di tab lain. Tutup konfirmasi dan periksa ulang sebelum menghapus dompet.",
        );
      if (!current.wallets.some((row) => row.id !== wallet.id && !row.archived))
        throw new Error(
          "Dompet aktif terakhir tidak dapat dihapus. Buat atau aktifkan dompet lain terlebih dahulu.",
        );
      const used =
        current.transactions.some((row) => row.walletId === wallet.id) ||
        current.transfers.some(
          (row) =>
            row.sourceWalletId === wallet.id ||
            row.targetWalletId === wallet.id,
        ) ||
        current.budgets.some((row) => row.walletId === wallet.id) ||
        current.schedules.some((row) => row.walletId === wallet.id) ||
        current.goals.some((row) => row.walletId === wallet.id) ||
        current.liabilities.some(
          (row) =>
            row.walletId === wallet.id || row.paymentWalletId === wallet.id,
        );
      if (used)
        throw new Error(
          "Dompet masih dipakai oleh transaksi atau fitur lain. Pindahkan atau hapus data terkait terlebih dahulu, atau arsipkan dompet.",
        );
      validateLedger({
        ...current,
        wallets: current.wallets.filter((row) => row.id !== wallet.id),
      });
      await this.wallets.delete(wallet.id);
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
  async importTransactions(
    rows: Transaction[],
    expectedRevision: number,
    batchName = "Impor CSV",
    matches: { line: number; transactionId: string }[] = [],
  ) {
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
      for (const match of matches)
        if (!current.transactions.some((t) => t.id === match.transactionId))
          throw new Error("Transaksi pencocokan sudah tidak tersedia.");
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
      const at = new Date().toISOString();
      await this.importBatches.add({
        id: crypto.randomUUID(),
        name: batchName.slice(0, 100),
        createdAt: at,
        updatedAt: at,
        transactionIds: rows.map((t) => t.id),
        fingerprints: rows.map((t) => canonical(t)),
        matches,
        undoneAt: null,
      });
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
      const access = await this.syncState.get("access");
      if (access?.value === "viewer" || access?.value === "revoked")
        throw new Error("Ruang ini tidak dapat diubah.");
      const next = validateLedger(plan.ledger);
      for (const name of entityNames) {
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
            entityNames.map((name) => [
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
      if (await this.syncState.get("baseline"))
        throw new Error(
          "Reset hanya tersedia untuk ledger lokal. Kelola ruang tersinkron lewat halaman Ruang & sinkronisasi.",
        );
      const current = await this.snapshot();
      if (current.revision !== expectedRevision)
        throw new Error(
          "Data berubah di tab lain. Tutup konfirmasi dan periksa data sebelum reset.",
        );
      for (const name of [...entityNames, "journal"] as const)
        await this.table(name).clear();
      const access = await this.syncState.get("access");
      if (access?.value === "viewer" || access?.value === "revoked")
        throw new Error("Ruang ini tidak dapat diubah.");
      await this.syncState.clear();
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
  async undoImport(id: string) {
    await this.transaction("rw", this.tables, async () => {
      const batch = await this.importBatches.get(id);
      if (!batch || batch.undoneAt)
        throw new Error("Batch sudah dibatalkan atau tidak ditemukan.");
      const rows = await this.transactions.bulkGet(batch.transactionIds);
      rows.forEach((row, i) => {
        if (
          !row ||
          canonical(row) !== canonical(JSON.parse(batch.fingerprints[i]))
        )
          throw new Error(
            "Ada transaksi batch yang sudah diubah/dihapus. Batalkan secara individual agar perubahan tidak hilang.",
          );
      });
      await this.transactions.bulkDelete(batch.transactionIds);
      const at = new Date().toISOString();
      await this.importBatches.update(id, { undoneAt: at, updatedAt: at });
      await this.bump();
    });
  }
  async applyRemote(ledger: Ledger, state?: { id: string; value: unknown }) {
    const { validateLedger } = await import("../domain/validation");
    validateLedger(ledger);
    await this.transaction("rw", this.tables, async () => {
      for (const name of entityNames) {
        await this.table(name).clear();
        await this.table(name).bulkPut(ledger[name]);
      }
      const old = await this.meta.get("main");
      await this.meta.put({
        id: "main",
        preferences: old?.preferences ?? ledger.preferences,
        revision: (old?.revision ?? 0) + 1,
      });
      if (state) await this.syncState.put(state);
    });
  }
}
export let db = new LedgerDatabase();
const databases = new Map([["ranledger", db]]);
export function selectLedger(workspaceId: string | null) {
  const name = workspaceId ? `ranledger-space-${workspaceId}` : "ranledger";
  db = databases.get(name) ?? new LedgerDatabase(name);
  databases.set(name, db);
  window.dispatchEvent(
    new CustomEvent("ranledger:workspace", { detail: workspaceId }),
  );
}
