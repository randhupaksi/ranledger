import "fake-indexeddb/auto";
import { splitText } from "../domain/serialization";
import Dexie from "dexie";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { LedgerDatabase } from "./database";
import {
  emptyLedger,
  initialWallet,
  totals,
  type Transaction,
} from "../domain/ledger";
import { journalEntries, position } from "../domain/finance";
import { forecast, calendarItems } from "../domain/forecast";
import {
  toRecords,
  fromRecords,
  mutations,
  mergeMutation,
} from "../domain/sync";
import {
  createBackup,
  parseBackup,
  backupToExcel,
  excelToBackup,
} from "./backup";
import { encryptBackup, decryptBackup } from "./encrypted-backup";
const at = "2026-10-01T00:00:00.000Z";
const transaction = (id: string, amount = 100): Transaction => ({
  id,
  amount,
  kind: "expense",
  walletId: "main-wallet",
  categoryId: "food",
  date: "2026-10-01",
  note: id,
  createdAt: at,
  updatedAt: at,
});
let database: LedgerDatabase;
beforeEach(async () => {
  database = new LedgerDatabase("v3-test-" + crypto.randomUUID());
  await database.open();
});
afterEach(async () => {
  await database.delete();
});
describe("v3 journal and liabilities", () => {
  it("purchase, payment and refund never double-count expense", () => {
    const ledger = emptyLedger();
    ledger.wallets[0].openingBalance = 1_000;
    ledger.wallets.push({
      ...initialWallet(),
      id: "card",
      name: "Kartu",
      type: "credit",
      openingBalance: -500,
    });
    ledger.transactions = [
      { ...transaction("purchase", 200), walletId: "card" },
      { ...transaction("refund", 50), walletId: "card", refund: true },
    ];
    ledger.transfers = [
      {
        id: "pay",
        sourceWalletId: "main-wallet",
        targetWalletId: "card",
        amount: 300,
        date: "2026-10-02",
        note: "Bayar",
        createdAt: at,
        updatedAt: at,
      },
    ];
    expect(totals(ledger.transactions)).toMatchObject({
      income: 0,
      expense: 150,
    });
    expect(position(ledger)).toMatchObject({
      assets: 700,
      debt: 350,
      netWorth: 350,
    });
    expect(
      journalEntries(ledger).every(
        (entry) => entry.postings.reduce((n, p) => n + p.amount, 0) === 0,
      ),
    ).toBe(true);
  });
  it("materialized journal follows create, edit, and delete atomically", async () => {
    const row = transaction("a");
    await database.saveTransaction(row, false);
    expect(
      (await database.journal.get("transaction_a"))?.postings[0].amount,
    ).toBe(-100);
    const saved = (await database.transactions.get("a"))!;
    await database.saveTransaction({ ...saved, amount: 250 }, true);
    expect(
      (await database.journal.get("transaction_a"))?.postings[0].amount,
    ).toBe(-250);
    await database.removeTransaction((await database.transactions.get("a"))!);
    expect(await database.journal.get("transaction_a")).toBeUndefined();
  });
  it("migrates v2 additively while retaining record bytes and balance", async () => {
    const name = "v2-upgrade-" + crypto.randomUUID();
    const old = new Dexie(name);
    old.version(2).stores({
      transactions: "id,date",
      categories: "id",
      meta: "id",
      wallets: "id",
      transfers: "id",
      budgets: "id",
      schedules: "id",
      goals: "id",
    });
    await old.open();
    const base = emptyLedger();
    for (const entity of [
      "transactions",
      "categories",
      "wallets",
      "transfers",
      "budgets",
      "schedules",
      "goals",
    ] as const)
      await old
        .table(entity)
        .bulkAdd(
          entity === "transactions" ? [transaction("old")] : base[entity],
        );
    await old
      .table("meta")
      .put({ id: "main", preferences: base.preferences, revision: 9 });
    old.close();
    const upgraded = new LedgerDatabase(name);
    try {
      await upgraded.open();
      const ledger = await upgraded.snapshot();
      expect(ledger.transactions).toEqual([transaction("old")]);
      expect(ledger.revision).toBe(9);
      expect(ledger.liabilities).toEqual([]);
      expect(
        (await upgraded.syncState.get("preV3Backup"))?.value,
      ).toMatchObject({ formatVersion: 2, transactions: [transaction("old")] });
      expect(await upgraded.journal.count()).toBe(2);
    } finally {
      await upgraded.delete();
    }
  });
  it("blocks reader writes and restores while allowing export", async () => {
    await database.syncState.put({ id: "access", value: "viewer" });
    await expect(
      database.saveTransaction(transaction("blocked"), false),
    ).rejects.toThrow("dibaca");
    expect(await database.transactions.count()).toBe(0);
    const ledger = await database.snapshot();
    await expect(
      database.restore(createBackup(ledger), "replace", ledger.revision),
    ).rejects.toThrow("diubah");
  });
});
describe("v3 planning and portability", () => {
  it("forecast counts future records and unrecorded schedule occurrences once", () => {
    const ledger = emptyLedger();
    ledger.wallets[0].openingBalance = 1000;
    ledger.schedules = [
      {
        id: "s",
        name: "Internet",
        kind: "expense",
        amount: 100,
        categoryId: "bills",
        walletId: "main-wallet",
        frequency: "monthly",
        nextDate: "2026-10-05",
        anchorDate: "2026-10-05",
        endDate: null,
        active: true,
        updatedAt: at,
      },
    ];
    ledger.transactions = [
      {
        ...transaction("already", 100),
        date: "2026-10-05",
        occurrenceKey: "s:2026-10-05",
      },
    ];
    const result = forecast(ledger, 30, undefined, "2026-10-01");
    expect(result.startBalance).toBe(1000);
    expect(result.endBalance).toBe(900);
    expect(result.points).toHaveLength(1);
  });
  it("payment plans cap at outstanding debt and target deadlines do not move cash", () => {
    const ledger = emptyLedger();
    ledger.wallets[0].openingBalance = 1000;
    ledger.wallets.push({
      ...initialWallet(),
      id: "loan",
      name: "Pinjaman",
      type: "loan",
      openingBalance: -150,
    });
    ledger.liabilities = [
      {
        id: "terms",
        walletId: "loan",
        paymentWalletId: "main-wallet",
        paymentAmount: 100,
        statementDay: 1,
        dueDay: 31,
        startDate: "2026-10-01",
        installments: 2,
        updatedAt: at,
      },
    ];
    const items = calendarItems(ledger, "2026-10-01", "2026-12-31");
    expect(items.map((i) => [i.date, i.amount])).toEqual([
      ["2026-10-31", 100],
      ["2026-11-30", 50],
    ]);
    const f = forecast(ledger, 90, undefined, "2026-10-01");
    expect(f.endBalance).toBe(850);
    expect(f.balances.get("loan")).toBe(0);
  });
  it("v3 JSON and Excel preserve liabilities, rules, and batch history", async () => {
    const ledger = emptyLedger();
    ledger.wallets.push({
      ...initialWallet(),
      id: "credit",
      name: "Kartu",
      type: "credit",
      openingBalance: -500,
    });
    ledger.liabilities = [
      {
        id: "term",
        walletId: "credit",
        paymentWalletId: "main-wallet",
        paymentAmount: 100,
        dueDay: 10,
        statementDay: 1,
        startDate: "2026-10-01",
        installments: 0,
        updatedAt: at,
      },
    ];
    ledger.rules = [
      {
        id: "rule",
        contains: "kopi",
        kind: "expense",
        categoryId: "food",
        enabled: true,
        updatedAt: at,
      },
    ];
    ledger.transactions = [{ ...transaction("refund"), refund: true }];
    const backup = createBackup(ledger, at);
    expect(await excelToBackup(await backupToExcel(backup))).toEqual(backup);
    const legacy = { ...backup, formatVersion: 2 };
    delete (legacy as Partial<typeof backup>).liabilities;
    delete (legacy as Partial<typeof backup>).rules;
    delete (legacy as Partial<typeof backup>).importBatches;
    expect(parseBackup(legacy).liabilities).toEqual([]);
  });
  it("encrypted backup verifies passphrase and rejects tampering", async () => {
    const backup = createBackup(emptyLedger(), at);
    const text = await encryptBackup(backup, "synthetic recovery phrase");
    expect(await decryptBackup(text, "synthetic recovery phrase")).toEqual(
      backup,
    );
    await expect(decryptBackup(text, "wrong recovery phrase")).rejects.toThrow(
      "Frasa sandi",
    );
    const envelope = JSON.parse(text);
    envelope.ciphertext = "AA" + envelope.ciphertext.slice(2);
    await expect(
      decryptBackup(JSON.stringify(envelope), "synthetic recovery phrase"),
    ).rejects.toThrow();
  });
  it("undo import is atomic and refuses to discard later edits", async () => {
    const initial = await database.snapshot();
    await database.importTransactions(
      [transaction("imported")],
      initial.revision,
      "sample.csv",
    );
    const batch = (await database.importBatches.toArray())[0];
    await database.undoImport(batch.id);
    expect(await database.transactions.count()).toBe(0);
    expect((await database.importBatches.get(batch.id))?.undoneAt).toBeTruthy();
    const next = await database.snapshot();
    await database.importTransactions([transaction("edited")], next.revision);
    const row = (await database.transactions.get("edited"))!;
    await database.saveTransaction({ ...row, note: "Updated" }, true);
    await expect(
      database.undoImport(
        (await database.importBatches.toArray()).find((b) => !b.undoneAt)!.id,
      ),
    ).rejects.toThrow("diubah");
    expect(await database.transactions.count()).toBe(1);
  });
  it("future transfers and future credit purchases appear exactly once", () => {
    const ledger = emptyLedger();
    ledger.wallets[0].openingBalance = 1000;
    ledger.wallets.push({
      ...initialWallet(),
      id: "card",
      name: "Card",
      type: "credit",
      openingBalance: -500,
    });
    ledger.liabilities = [
      {
        id: "t",
        walletId: "card",
        paymentWalletId: "main-wallet",
        paymentAmount: 100,
        statementDay: 1,
        dueDay: 10,
        startDate: "2026-10-01",
        installments: 0,
        updatedAt: at,
      },
    ];
    ledger.transfers = [
      {
        id: "future-pay",
        sourceWalletId: "main-wallet",
        targetWalletId: "card",
        amount: 100,
        date: "2026-10-10",
        note: "Scheduled payment",
        createdAt: at,
        updatedAt: at,
      },
    ];
    const result = forecast(ledger, 30, undefined, "2026-10-01");
    expect(result.endBalance).toBe(900);
    expect(result.balances.get("card")).toBe(-400);
    expect(result.points).toHaveLength(1);
    ledger.wallets[1].openingBalance = 0;
    ledger.transfers = [];
    ledger.transactions = [
      {
        ...transaction("future-buy", 300),
        walletId: "card",
        date: "2026-10-05",
      },
    ];
    expect(
      forecast(ledger, 30, undefined, "2026-10-01").balances.get("card"),
    ).toBe(-200);
  });
  it("installment counts begin at the first actual due date", () => {
    const ledger = emptyLedger();
    ledger.wallets.push({
      ...initialWallet(),
      id: "loan",
      name: "Loan",
      type: "loan",
      openingBalance: -200,
    });
    ledger.liabilities = [
      {
        id: "term",
        walletId: "loan",
        paymentWalletId: "main-wallet",
        paymentAmount: 100,
        dueDay: 10,
        statementDay: 1,
        startDate: "2026-10-18",
        installments: 2,
        updatedAt: at,
      },
    ];
    expect(
      calendarItems(ledger, "2026-10-01", "2027-01-01").map((i) => i.date),
    ).toEqual(["2026-11-10", "2026-12-10"]);
  });
});
describe("sync merge", () => {
  it("never splits a Unicode surrogate pair in transfer chunks", () => {
    const text = "a".repeat(499999) + "🟢".repeat(8);
    const chunks = splitText(text);
    expect(chunks.map((chunk) => Buffer.from(chunk).toString()).join("")).toBe(
      text,
    );
    expect(() => splitText("🟢", 1)).toThrow();
  });
  it("undo fingerprints remain valid after server JSON key ordering", async () => {
    const ledger = await database.snapshot();
    await database.importTransactions(
      [transaction("reordered")],
      ledger.revision,
    );
    const row = (await database.transactions.get("reordered"))!;
    await database.transaction("rw", database.tables, () =>
      database.transactions.put(
        Object.fromEntries(
          Object.entries(row).reverse(),
        ) as unknown as Transaction,
      ),
    );
    await database.undoImport((await database.importBatches.toArray())[0].id);
    expect(await database.transactions.count()).toBe(0);
  });
  it("merges independent edits and exposes same-field conflicts", () => {
    const before = { id: "a", note: "old", amount: 1, updatedAt: "1" };
    expect(
      mergeMutation(
        {
          entity: "transactions",
          id: "a",
          before,
          after: { ...before, note: "mine", updatedAt: "2" },
        },
        { ...before, amount: 2, updatedAt: "3" },
      ),
    ).toEqual({
      conflict: false,
      value: { id: "a", note: "mine", amount: 2, updatedAt: "3" },
    });
    expect(
      mergeMutation(
        {
          entity: "transactions",
          id: "a",
          before,
          after: { ...before, note: "mine" },
        },
        { ...before, note: "theirs" },
      ).conflict,
    ).toBe(true);
    expect(
      mergeMutation(
        { entity: "transactions", id: "a", before, after: null },
        { ...before, note: "theirs" },
      ).conflict,
    ).toBe(true);
  });
  it("canonical records preserve all finance entities and identify deletions", () => {
    const ledger = emptyLedger();
    ledger.transactions = [transaction("a")];
    const records = toRecords(ledger);
    expect(fromRecords(records)).toEqual(ledger);
    const next = { ...records };
    delete next["transactions/a"];
    expect(mutations(records, next)).toEqual([
      {
        entity: "transactions",
        id: "a",
        before: records["transactions/a"],
        after: null,
      },
    ]);
  });
});
