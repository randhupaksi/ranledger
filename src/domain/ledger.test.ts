import { describe, expect, it } from "vitest";
import {
  categoryTotals,
  dateRange,
  emptyLedger,
  filterTransactions,
  parseAmount,
  safeSum,
  totals,
  validDate,
} from "./ledger";
import type { Transaction } from "./ledger";
import { validateLedger } from "./validation";
const at = "2026-10-17T08:00:00.000Z";
function tx(
  id: string,
  amount: number,
  kind: "income" | "expense",
  date = "2026-10-17",
): Transaction {
  return {
    id,
    amount,
    kind,
    categoryId: kind === "income" ? "salary" : "food",
    date,
    note: "catatan",
    createdAt: at,
    updatedAt: at,
  };
}
describe("perhitungan keuangan", () => {
  it("memisahkan saldo awal dari pemasukan periode dan memperbarui setelah edit/hapus", () => {
    const transactions = [
      tx("a", 2_500_000, "income"),
      tx("b", 35_000, "expense"),
      tx("c", 50_000, "expense", "2026-09-30"),
    ];
    expect(totals(transactions, 500_000)).toEqual({
      income: 2_500_000,
      expense: 85_000,
      net: 2_415_000,
      balance: 2_915_000,
    });
    const edited = transactions.map((t) =>
      t.id === "b" ? { ...t, amount: 40_000 } : t,
    );
    expect(totals(edited, 500_000).balance).toBe(2_910_000);
    expect(
      totals(
        edited.filter((t) => t.id !== "c"),
        500_000,
      ).balance,
    ).toBe(2_960_000);
    const october = filterTransactions(transactions, emptyLedger().categories, {
      start: "2026-10-01",
      end: "2026-10-31",
      kind: "all",
      categoryId: "",
      search: "",
    });
    expect(totals(october)).toMatchObject({
      income: 2_500_000,
      expense: 35_000,
      balance: 2_465_000,
    });
  });
  it.each([
    "0",
    "-1",
    "1,5",
    "1.5",
    "2.50",
    "1.5e2",
    "Rp 5000",
    "",
    "1000000000001",
    "NaN",
  ])("menolak nominal tidak valid: %s", (value) => {
    expect(() => parseAmount(value)).toThrow();
  });
  it("memahami pemisah ribuan tanpa pembulatan dan mendukung saldo awal negatif", () => {
    expect(parseAmount("25.000")).toBe(25000);
    expect(parseAmount("-50.000", true)).toBe(-50000);
    expect(parseAmount("0", true)).toBe(0);
  });
  it("menolak total yang melebihi integer aman", () => {
    expect(() => safeSum([Number.MAX_SAFE_INTEGER, 1])).toThrow();
  });
});
describe("tanggal dan pencarian", () => {
  it("memvalidasi kalender termasuk tahun kabisat", () => {
    expect(validDate("2024-02-29")).toBe(true);
    expect(validDate("2026-02-29")).toBe(false);
    expect(validDate("2026-13-01")).toBe(false);
    expect(validDate("2026-1-1")).toBe(false);
  });
  it("minggu dimulai Senin, lintas bulan dan tahun tetap konsisten", () => {
    expect(dateRange("week", undefined, new Date(2026, 0, 1, 0, 5))).toEqual({
      start: "2025-12-29",
      end: "2026-01-01",
    });
    expect(
      dateRange("month", undefined, new Date(2026, 9, 17, 23, 50)),
    ).toEqual({ start: "2026-10-01", end: "2026-10-17" });
  });
  it("mencari teks/kategori, menggabungkan filter, dan memakai urutan stabil", () => {
    const ledger = emptyLedger();
    const rows = [
      tx("b", 10_000, "expense"),
      tx("a", 15_000, "expense"),
      tx("c", 1_000_000, "income"),
    ];
    const found = filterTransactions(rows, ledger.categories, {
      start: "2026-10-01",
      end: "2026-10-31",
      kind: "expense",
      categoryId: "food",
      search: "MAKAN",
    });
    expect(found.map((t) => t.id)).toEqual(["a", "b"]);
    expect(
      categoryTotals(found, ledger.categories).reduce(
        (sum, c) => sum + c.amount,
        0,
      ),
    ).toBe(totals(found).expense);
  });
  it("menolak kategori hilang, jenis tidak cocok, dan ID ganda", () => {
    const ledger = emptyLedger();
    ledger.transactions = [tx("a", 1000, "income")];
    expect(() => validateLedger({ ...ledger, categories: [] })).toThrow(
      /Kategori/,
    );
    expect(() =>
      validateLedger({
        ...ledger,
        transactions: [{ ...ledger.transactions[0], categoryId: "food" }],
      }),
    ).toThrow(/Kategori/);
    expect(() =>
      validateLedger({
        ...ledger,
        transactions: [...ledger.transactions, ...ledger.transactions],
      }),
    ).toThrow(/ganda/);
  });
});
