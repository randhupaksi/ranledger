import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LedgerDatabase } from "./database";
import { createBackup, exampleBackup } from "./backup";
import { totals } from "../domain/ledger";

let database: LedgerDatabase;
beforeEach(async () => {
  database = new LedgerDatabase(`ranledger-test-${crypto.randomUUID()}`);
  await database.open();
});
afterEach(async () => {
  database.close();
  await database.delete();
  vi.restoreAllMocks();
});
describe("storage and atomic transactions", () => {
  it("saves, reopens, edits, and deletes records while keeping balances accurate", async () => {
    const tx = exampleBackup().transactions[0];
    await database.saveTransaction(tx, false);
    database.close();
    await database.open();
    let saved = (await database.snapshot()).transactions[0];
    expect(saved.amount).toBe(2_500_000);
    await database.saveTransaction({ ...saved, amount: 3_000_000 }, true);
    saved = (await database.snapshot()).transactions[0];
    expect(totals([saved]).income).toBe(3_000_000);
    await database.removeTransaction(saved);
    expect((await database.snapshot()).transactions).toHaveLength(0);
  });
  it("prevents duplicate submissions that reuse the same ID", async () => {
    const t = exampleBackup().transactions[0];
    await database.saveTransaction(t, false);
    await expect(database.saveTransaction(t, false)).rejects.toThrow();
    expect((await database.snapshot()).transactions).toHaveLength(1);
  });
  it("archiving or renaming a category preserves its history and references", async () => {
    const t = exampleBackup().transactions[1];
    await database.saveTransaction(t, false);
    const c = (await database.snapshot()).categories.find(
      (c) => c.id === "food",
    )!;
    await database.saveCategory({ ...c, name: "Makan harian", archived: true });
    const saved = await database.snapshot();
    expect(saved.transactions[0].categoryId).toBe("food");
    expect(saved.categories.find((c) => c.id === "food")).toMatchObject({
      archived: true,
      name: "Makan harian",
    });
  });
  it("backup → reset → import restores all data and verifies the result", async () => {
    await database.restore(exampleBackup(), "replace", 0);
    const before = await database.snapshot();
    const backup = createBackup(before);
    await database.reset(before.revision);
    const cleared = await database.snapshot();
    expect(cleared.transactions).toHaveLength(0);
    await database.restore(backup, "replace", cleared.revision);
    const restored = await database.snapshot();
    expect(restored.transactions).toEqual(before.transactions);
    expect(restored.categories).toEqual(before.categories);
    expect(restored.preferences).toEqual(before.preferences);
  });
  it("corrupt files do not modify healthy data", async () => {
    await database.saveTransaction(exampleBackup().transactions[0], false);
    const before = await database.snapshot();
    const invalid = exampleBackup();
    invalid.categories = [];
    await expect(
      database.restore(invalid, "replace", before.revision),
    ).rejects.toThrow();
    expect(await database.snapshot()).toEqual(before);
  });
  it("a mid-import failure rolls back the clear and all writes", async () => {
    await database.saveTransaction(exampleBackup().transactions[0], false);
    const before = await database.snapshot();
    vi.spyOn(database.categories, "bulkAdd").mockRejectedValueOnce(
      new Error("Simulasi storage penuh"),
    );
    await expect(
      database.restore(exampleBackup(), "replace", before.revision),
    ).rejects.toThrow(/storage penuh/);
    expect(await database.snapshot()).toEqual(before);
  });
  it("rejects stale previews and edits from another tab", async () => {
    await database.saveTransaction(exampleBackup().transactions[0], false);
    const before = await database.snapshot();
    const old = before.transactions[0];
    await database.saveTransaction(
      { ...old, note: "berubah di tab lain" },
      true,
    );
    await expect(
      database.restore(exampleBackup(), "replace", before.revision),
    ).rejects.toThrow(/berubah/);
    await expect(
      database.saveTransaction({ ...old, amount: 50_000 }, true),
    ).rejects.toThrow(/berubah/);
    await expect(database.removeTransaction(old)).rejects.toThrow(/berubah/);
  });
  it("a mismatched verification result rolls back the entire restore", async () => {
    await database.saveTransaction(exampleBackup().transactions[0], false);
    const before = await database.snapshot();
    vi.spyOn(database, "snapshot")
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce({ ...before, transactions: [] });
    await expect(
      database.restore(exampleBackup(), "replace", before.revision),
    ).rejects.toThrow(/Pemeriksaan pemulihan gagal/);
    expect(await database.snapshot()).toEqual(before);
  });
});
