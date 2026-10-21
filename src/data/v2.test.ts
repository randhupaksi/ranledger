import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LedgerDatabase } from "./database";
import {
  backupToExcel,
  createBackup,
  excelToBackup,
  makeImportPlan,
  parseBackup,
} from "./backup";
import {
  defaultCategories,
  defaultPreferences,
  emptyLedger,
  initialWallet,
} from "../domain/ledger";
import type { Ledger } from "../domain/ledger";
import {
  budgetProgresses,
  ledgerTotals,
  nextOccurrence,
  walletBalances,
} from "../domain/planning";
import { validateLedger } from "../domain/validation";
import { buildCsvPreview, csvAmount, csvDate, parseCsv } from "./csv";
import type { CsvMapping } from "./csv";

const at = "2026-01-01T00:00:00.000Z";
const databases: Dexie[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const database of databases.splice(0)) {
    database.close();
    await database.delete();
  }
});
async function database() {
  const db = new LedgerDatabase(`v2-test-${crypto.randomUUID()}`);
  databases.push(db);
  await db.open();
  return db;
}
function sample(): Ledger {
  const ledger = emptyLedger();
  ledger.wallets = [
    initialWallet(1_000_000),
    {
      id: "bank",
      name: "Tabungan",
      type: "savings",
      openingBalance: 200_000,
      archived: false,
      updatedAt: at,
    },
  ];
  ledger.transactions = [
    {
      id: "expense",
      kind: "expense",
      walletId: "main-wallet",
      categoryId: "food",
      amount: 100_000,
      date: "2026-01-05",
      note: "Makan",
      createdAt: at,
      updatedAt: at,
    },
  ];
  ledger.transfers = [
    {
      id: "transfer",
      sourceWalletId: "main-wallet",
      targetWalletId: "bank",
      amount: 300_000,
      date: "2026-01-06",
      note: "Menabung",
      createdAt: at,
      updatedAt: at,
    },
  ];
  ledger.budgets = [
    {
      id: "budget",
      month: "2026-01",
      categoryId: "food",
      walletId: null,
      amount: 120_000,
      updatedAt: at,
    },
  ];
  ledger.schedules = [
    {
      id: "schedule",
      name: "Internet",
      kind: "expense",
      categoryId: "bills",
      walletId: "main-wallet",
      amount: 200_000,
      frequency: "monthly",
      anchorDate: "2026-01-31",
      nextDate: "2026-01-31",
      endDate: null,
      active: true,
      updatedAt: at,
    },
  ];
  ledger.goals = [
    {
      id: "goal",
      name: "Dana darurat",
      walletId: "bank",
      amount: 2_000_000,
      targetDate: "2026-12-31",
      archived: false,
      updatedAt: at,
    },
  ];
  return ledger;
}
describe("Ranledger 2 migrations and backups", () => {
  it("migrates the v1 database without changing transactions, balances, categories, or preferences", async () => {
    const name = `legacy-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      transactions: "id,date,kind,categoryId,createdAt",
      categories: "id,kind",
      meta: "id",
    });
    await old.open();
    const { walletId: _wallet, ...transaction } = sample().transactions[0];
    await old.table("transactions").add(transaction);
    await old.table("categories").bulkAdd(defaultCategories);
    await old.table("meta").add({
      id: "main",
      preferences: {
        openingBalance: 1_000_000,
        ...defaultPreferences,
        theme: "dark",
      },
      revision: 4,
    });
    old.close();
    const next = new LedgerDatabase(name);
    databases.push(next);
    await next.open();
    const migrated = await next.snapshot();
    expect(migrated.transactions[0]).toEqual({
      ...transaction,
      walletId: "main-wallet",
    });
    expect(migrated.wallets[0].openingBalance).toBe(1_000_000);
    expect(migrated.preferences.theme).toBe("dark");
    expect(migrated.revision).toBe(5);
    expect(ledgerTotals(migrated).balance).toBe(900_000);
    validateLedger(migrated);
  });
  it("a failed migration preserves the original v1 database", async () => {
    const name = `broken-v1-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      transactions: "id,date,kind,categoryId,createdAt",
      categories: "id,kind",
      meta: "id",
    });
    await old.open();
    await old.table("categories").bulkAdd(defaultCategories);
    old.close();
    const next = new LedgerDatabase(name);
    await expect(next.open()).rejects.toThrow(/tidak lengkap/);
    next.close();
    const inspect = new Dexie(name);
    databases.push(inspect);
    await inspect.open();
    expect(inspect.verno).toBe(1);
    expect(await inspect.table("categories").count()).toBe(
      defaultCategories.length,
    );
  });
  it("reads v1 JSON and Excel files and moves the opening balance to the Main wallet", async () => {
    const { walletId: _wallet, ...transaction } = sample().transactions[0];
    const legacy = {
      app: "ranledger",
      formatVersion: 1,
      currency: "IDR",
      exportedAt: at,
      transactions: [transaction],
      categories: defaultCategories,
      preferences: { openingBalance: 1_000_000, ...defaultPreferences },
    };
    const migrated = parseBackup(legacy);
    expect(migrated.formatVersion).toBe(3);
    expect(migrated.wallets[0].openingBalance).toBe(1_000_000);
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    for (const [name, rows] of [
      [
        "Ranledger",
        [
          {
            app: legacy.app,
            formatVersion: 1,
            currency: "IDR",
            exportedAt: at,
          },
        ],
      ],
      ["Transaksi", legacy.transactions],
      ["Kategori", legacy.categories],
      ["Pengaturan", [{ ...legacy.preferences, lastBackupAt: "" }]],
    ] as const)
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.json_to_sheet(
          [...rows],
          name === "Transaksi"
            ? {
                header: [
                  "id",
                  "kind",
                  "amount",
                  "categoryId",
                  "date",
                  "note",
                  "createdAt",
                  "updatedAt",
                ],
              }
            : {},
        ),
        name,
      );
    expect(
      await excelToBackup(
        XLSX.write(book, { type: "array", bookType: "xlsx" }),
      ),
    ).toEqual(migrated);
  });
  it("all v2 features round-trip identically through JSON and Excel", async () => {
    const backup = createBackup(sample(), at);
    expect(parseBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
    expect(await excelToBackup(await backupToExcel(backup))).toEqual(backup);
    const db = await database();
    await db.restore(backup, "replace", 0);
    const restored = createBackup(await db.snapshot(), at);
    for (const name of [
      "transactions",
      "categories",
      "wallets",
      "transfers",
      "budgets",
      "schedules",
      "goals",
    ] as const)
      expect(
        [...restored[name]].sort((a, b) => a.id.localeCompare(b.id)),
      ).toEqual([...backup[name]].sort((a, b) => a.id.localeCompare(b.id)));
    expect(restored.preferences).toEqual(backup.preferences);
    const second = makeImportPlan(await db.snapshot(), backup, "merge");
    expect(second.added).toBe(0);
    expect(Object.values(second.features)).toEqual([0, 0, 0, 0, 0]);
  });
});
describe("balance rules and planning", () => {
  it("all-wallet scope does not collide with wallet IDs from a backup", () => {
    const ledger = sample();
    ledger.wallets[1].id = "all";
    ledger.transactions[0].walletId = "all";
    ledger.transfers[0].targetWalletId = "all";
    ledger.goals[0].walletId = "all";
    ledger.budgets.push({
      ...ledger.budgets[0],
      id: "scoped",
      walletId: "all",
    });
    validateLedger(ledger);
    const progress = budgetProgresses(ledger.budgets, ledger);
    expect(progress.get("budget")?.spent).toBe(100_000);
    expect(progress.get("scoped")?.spent).toBe(100_000);
  });
  it("merge remaps wallet references and preserves local balances and schedules", () => {
    const current = sample(),
      incoming = sample();
    incoming.wallets[1] = {
      ...incoming.wallets[1],
      id: "external-bank",
      openingBalance: 5_000_000,
    };
    incoming.transactions = [
      {
        ...incoming.transactions[0],
        id: "external-row",
        walletId: "external-bank",
      },
    ];
    incoming.transfers = [
      {
        ...incoming.transfers[0],
        id: "external-transfer",
        targetWalletId: "external-bank",
      },
    ];
    incoming.goals[0].walletId = "external-bank";
    incoming.schedules[0].nextDate = "2026-02-28";
    const plan = makeImportPlan(current, createBackup(incoming), "merge");
    expect(plan.ledger.wallets).toHaveLength(2);
    expect(
      plan.ledger.wallets.find((w) => w.id === "bank")?.openingBalance,
    ).toBe(200_000);
    expect(
      plan.ledger.transactions.find((t) => t.id === "external-row")?.walletId,
    ).toBe("bank");
    expect(
      plan.ledger.transfers.find((t) => t.id === "external-transfer")
        ?.targetWalletId,
    ).toBe("bank");
    expect(plan.ledger.schedules[0].nextDate).toBe("2026-01-31");
    expect(plan.ledger.goals).toHaveLength(1);
  });
  it("a recurring transaction write failure does not advance the schedule", async () => {
    const db = await database();
    await db.saveEntity("schedules", sample().schedules[0], false);
    const before = await db.snapshot();
    vi.spyOn(db.transactions, "add").mockRejectedValueOnce(
      new Error("storage penuh"),
    );
    await expect(
      db.resolveSchedule(before.schedules[0], "record"),
    ).rejects.toThrow(/storage penuh/);
    expect(await db.snapshot()).toEqual(before);
  });
  it("a transfer changes two wallets but not cash flow or the combined balance", () => {
    const ledger = sample();
    const balances = walletBalances(ledger);
    expect(balances.get("main-wallet")).toBe(600_000);
    expect(balances.get("bank")).toBe(500_000);
    expect(ledgerTotals(ledger)).toMatchObject({
      income: 0,
      expense: 100_000,
      balance: 1_100_000,
    });
    ledger.transfers = [];
    expect(ledgerTotals(ledger).balance).toBe(1_100_000);
  });
  it("budgets use the correct month and wallet scope", () => {
    const ledger = sample();
    ledger.budgets.push({
      ...ledger.budgets[0],
      id: "bank-budget",
      walletId: "bank",
    });
    ledger.transactions.push({
      ...ledger.transactions[0],
      id: "february",
      date: "2026-02-01",
      amount: 500_000,
    });
    const progress = budgetProgresses(ledger.budgets, ledger);
    expect(progress.get("budget")).toMatchObject({
      spent: 100_000,
      remaining: 20_000,
      status: "near",
    });
    expect(progress.get("bank-budget")?.spent).toBe(0);
  });
  it("month-end and leap-year schedules preserve their anchor date", () => {
    let schedule = sample().schedules[0];
    expect(nextOccurrence(schedule)).toBe("2026-02-28");
    schedule = { ...schedule, nextDate: "2026-02-28" };
    expect(nextOccurrence(schedule)).toBe("2026-03-31");
    schedule = {
      ...schedule,
      frequency: "yearly",
      anchorDate: "2024-02-29",
      nextDate: "2027-02-28",
    };
    expect(nextOccurrence(schedule)).toBe("2028-02-29");
  });
  it("records or skips a schedule atomically and rejects confirmation from a stale tab", async () => {
    const db = await database();
    const schedule = sample().schedules[0];
    await db.saveEntity("schedules", schedule, false);
    const saved = (await db.snapshot()).schedules[0];
    await db.resolveSchedule(saved, "record");
    await expect(db.resolveSchedule(saved, "record")).rejects.toThrow(
      /berubah/,
    );
    let ledger = await db.snapshot();
    expect(ledger.transactions).toHaveLength(1);
    expect(ledger.transactions[0].date).toBe("2026-01-31");
    expect(ledger.schedules[0].nextDate).toBe("2026-02-28");
    await db.resolveSchedule(ledger.schedules[0], "skip");
    ledger = await db.snapshot();
    expect(ledger.transactions).toHaveLength(1);
    expect(ledger.schedules[0].nextDate).toBe("2026-03-31");
  });
  it("rejects duplicate budgets, per-wallet goals, and transfers to the same wallet", () => {
    const ledger = sample();
    expect(() =>
      validateLedger({
        ...ledger,
        budgets: [...ledger.budgets, { ...ledger.budgets[0], id: "other" }],
      }),
    ).toThrow(/sudah ada/);
    expect(() =>
      validateLedger({
        ...ledger,
        goals: [...ledger.goals, { ...ledger.goals[0], id: "other" }],
      }),
    ).toThrow(/satu target/);
    expect(() =>
      validateLedger({
        ...ledger,
        transfers: [{ ...ledger.transfers[0], targetWalletId: "main-wallet" }],
      }),
    ).toThrow(/dua dompet/);
  });
  it("the last wallet cannot be archived and transfer edit conflicts are detected", async () => {
    const db = await database();
    const main = (await db.snapshot()).wallets[0];
    await expect(
      db.saveEntity("wallets", { ...main, archived: true }, true),
    ).rejects.toThrow(/minimal satu/);
    const ledger = sample();
    await db.restore(createBackup(ledger), "replace", 0);
    const transfer = (await db.snapshot()).transfers[0];
    await db.saveEntity("transfers", { ...transfer, amount: 200_000 }, true);
    await expect(db.saveEntity("transfers", transfer, true)).rejects.toThrow(
      /berubah/,
    );
  });
});
const mapping: CsvMapping = {
  date: 0,
  amount: 1,
  note: 2,
  kind: -1,
  category: -1,
  debit: -1,
  credit: -1,
  direction: "signed",
  dateFormat: "dmy",
  numberFormat: "id",
  walletId: "main-wallet",
  incomeCategoryId: "salary",
  expenseCategoryId: "food",
};
describe("CSV import", () => {
  it("reads BOMs, separators, escaped quotes, and quoted newlines, and rejects malformed CSV", () => {
    const data = parseCsv(
      '\uFEFFTanggal;Nominal;Catatan\r\n05/01/2026;-100000;"Makan; enak\nlagi ""ya"""',
    );
    expect(data.delimiter).toBe(";");
    expect(data.rows[0][2]).toBe('Makan; enak\nlagi "ya"');
    expect(() => parseCsv('a,b\n1,"rusak')).toThrow(/kutip/);
    expect(() => parseCsv("a,a\n1,2")).toThrow(/berbeda/);
    expect(() => parseCsv('a,b\n1,"x"z')).toThrow(/kutip/);
  });
  it("does not guess ambiguous dates or round fractional rupiah amounts", () => {
    expect(csvDate("01/02/2026", "dmy")).toBe("2026-02-01");
    expect(csvDate("01/02/2026", "mdy")).toBe("2026-01-02");
    expect(() => csvDate("31/02/2026", "dmy")).toThrow();
    expect(csvAmount("1.500,00", "id")).toBe(1500);
    expect(csvAmount("1,500.00", "en")).toBe(1500);
    expect(() => csvAmount("1.500,50", "id")).toThrow();
    expect(() => csvAmount("1.5", "id")).toThrow();
  });
  it("marks local and internal duplicates without clearing the user's selections", () => {
    const data = parseCsv(
      "Tanggal;Nominal;Catatan\n05/01/2026;-100000;Makan\n06/01/2026;-20000;Baru\n06/01/2026;-20000;Baru\n31/02/2026;10;Rusak",
    );
    const rows = buildCsvPreview(data, mapping, sample());
    expect(rows.map((r) => r.duplicate)).toEqual([true, false, true, false]);
    expect(rows.map((r) => r.include)).toEqual([false, true, false, false]);
    expect(rows[3].error).toMatch(/Tanggal/);
  });
  it("imports debits and credits and matches categories by name", () => {
    const data = parseCsv(
      "Tanggal;Debit;Kredit;Kategori\n2026-01-01;25000;;Makan & Minum\n2026-01-02;;1500000;Gaji/Freelance",
    );
    const rows = buildCsvPreview(
      data,
      {
        ...mapping,
        dateFormat: "iso",
        direction: "debit-credit",
        debit: 1,
        credit: 2,
        category: 3,
        note: -1,
      },
      emptyLedger(),
    );
    expect(rows.map((r) => r.transaction?.kind)).toEqual(["expense", "income"]);
    expect(rows[0].transaction?.categoryId).toBe("food");
  });
  it("a stale import or write failure rolls back every row", async () => {
    const db = await database();
    const rows = buildCsvPreview(
      parseCsv("Tanggal;Nominal;Catatan\n01/01/2026;100000;Masuk"),
      mapping,
      await db.snapshot(),
    ).map((r) => r.transaction!);
    vi.spyOn(db.transactions, "bulkAdd").mockRejectedValueOnce(
      new Error("storage penuh"),
    );
    await expect(db.importTransactions(rows, 0)).rejects.toThrow(
      /storage penuh/,
    );
    expect((await db.snapshot()).transactions).toHaveLength(0);
    await db.updatePreferences({ theme: "dark" });
    await expect(db.importTransactions(rows, 0)).rejects.toThrow(/berubah/);
  });
});
