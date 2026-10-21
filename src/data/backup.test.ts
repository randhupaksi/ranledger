import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  backupToExcel,
  createBackup,
  exampleBackup,
  excelToBackup,
  makeImportPlan,
  parseBackup,
  readBackupFile,
} from "./backup";
import { emptyLedger, totals } from "../domain/ledger";
import { ledgerTotals } from "../domain/planning";

describe("JSON and Excel backups", () => {
  it("an empty Excel backup can be fully restored", async () => {
    const backup = createBackup(emptyLedger());
    expect(await excelToBackup(await backupToExcel(backup))).toEqual(backup);
  });
  it("restores all JSON data, including archived categories, preferences, and opening balances", () => {
    const example = exampleBackup();
    example.categories[0].archived = true;
    example.preferences.theme = "dark";
    example.preferences.dateFormat = "short";
    const parsed = parseBackup(JSON.parse(JSON.stringify(example)));
    const plan = makeImportPlan(emptyLedger(), parsed, "replace");
    expect(createBackup(plan.ledger, example.exportedAt)).toEqual(example);
    expect(ledgerTotals(plan.ledger).balance).toBe(2_915_000);
  });
  it("Excel round-trips preserve data, including notes that resemble formulas or HTML", async () => {
    const example = exampleBackup();
    example.transactions[0].note =
      '=HYPERLINK("https://example.invalid") <img src=x onerror=alert(1)> & ü 💚';
    example.categories[0].archived = true;
    example.preferences.lastBackupAt = "2026-01-01T00:00:00.000Z";
    const buffer = await backupToExcel(example);
    const book = XLSX.read(buffer, { type: "array" });
    expect(book.Sheets.Transaksi.F2.t).toBe("s");
    expect(book.Sheets.Transaksi.F2.f).toBeUndefined();
    expect(await excelToBackup(buffer)).toEqual(example);
  });
  it("repeated merges avoid duplicates and preserve differing local versions", () => {
    const sample = exampleBackup();
    const first = makeImportPlan(emptyLedger(), sample, "merge");
    expect(first.added).toBe(3);
    expect(first.ledger.wallets[0].openingBalance).toBe(0);
    first.ledger.transactions[0].amount = 9_000_000;
    const second = makeImportPlan(first.ledger, sample, "merge");
    expect(second.added).toBe(0);
    expect(second.duplicates).toBe(3);
    expect(second.conflicts).toBe(1);
    expect(second.ledger.transactions[0].amount).toBe(9_000_000);
  });
  it("merges same-name categories without breaking references", () => {
    const sample = exampleBackup();
    sample.categories[0].id = "new-food";
    sample.transactions[1].categoryId = "new-food";
    const plan = makeImportPlan(emptyLedger(), sample, "merge");
    expect(plan.ledger.categories.length).toBe(emptyLedger().categories.length);
    expect(plan.ledger.transactions[1].categoryId).toBe("food");
  });
  it("rejects unsupported versions, unknown fields, fractional amounts, missing categories, and internal duplicates", () => {
    const backup = exampleBackup();
    expect(() => parseBackup({ ...backup, formatVersion: 99 })).toThrow();
    expect(() => parseBackup({ ...backup, evil: "x" })).toThrow();
    expect(() =>
      parseBackup({
        ...backup,
        transactions: [{ ...backup.transactions[0], amount: 0.1 }],
      }),
    ).toThrow();
    expect(() => parseBackup({ ...backup, categories: [] })).toThrow();
    expect(() =>
      parseBackup({
        ...backup,
        transactions: [...backup.transactions, backup.transactions[0]],
      }),
    ).toThrow(/ganda/);
  });
  it("rejects Excel formulas, ordinary reports, corrupt files, and oversized files", async () => {
    const book = XLSX.read(await backupToExcel(exampleBackup()), {
      type: "array",
    });
    book.Sheets.Transaksi.F2 = {
      t: "s",
      f: 'HYPERLINK("https://example.invalid")',
      v: "klik",
    };
    await expect(
      excelToBackup(XLSX.write(book, { type: "array", bookType: "xlsx" })),
    ).rejects.toThrow(/rumus/);
    delete book.Sheets.Ranledger;
    await expect(
      excelToBackup(XLSX.write(book, { type: "array", bookType: "xlsx" })),
    ).rejects.toThrow();
    await expect(
      readBackupFile(new File(["{"], "broken.json")),
    ).rejects.toThrow(/rusak/);
    await expect(
      readBackupFile({
        name: "large.json",
        size: 256 * 1024 * 1024 + 1,
      } as File),
    ).rejects.toThrow(/256 MB/);
  });
  it("handles 10,000 transactions across years with consistent totals", async () => {
    const ledger = emptyLedger();
    const base = exampleBackup().transactions[0];
    ledger.transactions = Array.from({ length: 10_000 }, (_, i) => ({
      ...base,
      id: `many-${i}`,
      amount: 10_000,
      date: `${2020 + (i % 7)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
    }));
    const backup = createBackup(ledger);
    const plan = makeImportPlan(
      emptyLedger(),
      await excelToBackup(await backupToExcel(backup)),
      "replace",
    );
    expect(plan.ledger.transactions).toHaveLength(10_000);
    expect(totals(plan.ledger.transactions).income).toBe(100_000_000);
  });
});
