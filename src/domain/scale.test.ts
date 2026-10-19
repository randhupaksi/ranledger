import { it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { emptyLedger, type Transaction } from "./ledger";
import { journalEntries, position } from "./finance";
import { forecast } from "./forecast";
import { toRecords, mutations } from "./sync";
it("maintains journal and projection invariants at 10k, 50k, and 100k records", async () => {
  const metrics = [];
  for (const count of [10000, 50000, 100000]) {
    const ledger = emptyLedger();
    ledger.wallets[0].openingBalance = 1_000_000_000;
    const at = "2026-01-01T00:00:00.000Z";
    ledger.transactions = Array.from(
      { length: count },
      (_, i): Transaction => ({
        id: `synthetic-${i}`,
        kind: "expense",
        amount: 1,
        categoryId: "food",
        walletId: "main-wallet",
        date: i % 2 ? "2026-10-01" : "2026-10-20",
        note: "Synthetic scale fixture",
        createdAt: at,
        updatedAt: at,
      }),
    );
    const started = performance.now();
    const entries = journalEntries(ledger);
    const positioned = position(ledger);
    const projected = forecast(ledger, 30, undefined, "2026-10-01");
    const records = toRecords(ledger);
    const diff = mutations(records, records);
    expect(entries).toHaveLength(count + 1);
    expect(positioned.assets).toBe(1_000_000_000 - count);
    expect(projected.endBalance).toBe(positioned.assets);
    expect(diff).toHaveLength(0);
    metrics.push({
      records: count,
      domainMilliseconds: Math.round(performance.now() - started),
      scope: "journal + position + 30-day forecast + unchanged sync diff",
    });
  }
  await mkdir(".cache", { recursive: true });
  await writeFile(
    ".cache/v3-domain-benchmarks.json",
    JSON.stringify({ capturedAt: new Date().toISOString(), metrics }, null, 2),
  );
}, 20000);
