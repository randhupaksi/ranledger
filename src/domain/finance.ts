import { safeSum, type Ledger, type Wallet } from "./ledger";

export const entityNames = [
  "transactions",
  "categories",
  "wallets",
  "transfers",
  "budgets",
  "schedules",
  "goals",
  "liabilities",
  "importBatches",
  "rules",
] as const;
export type EntityName = (typeof entityNames)[number];
export interface Posting {
  accountId: string;
  amount: number;
}
export interface JournalEntry {
  id: string;
  date: string;
  note: string;
  postings: Posting[];
}
export const isLiability = (w: Pick<Wallet, "type">) =>
  ["credit", "paylater", "loan"].includes(w.type);

// Source records remain canonical; these balanced journal projections are reproducible.
export function journalEntries(ledger: Ledger): JournalEntry[] {
  const entries: JournalEntry[] = ledger.wallets.map((w) => ({
    id: `opening_${w.id}`,
    date: "1900-01-01",
    note: `Saldo awal ${w.name}`,
    postings: [
      { accountId: w.id, amount: w.openingBalance },
      { accountId: "equity:opening", amount: -w.openingBalance },
    ],
  }));
  for (const t of ledger.transactions) {
    const amount = t.kind === "income" || t.refund ? t.amount : -t.amount;
    entries.push({
      id: `transaction_${t.id}`,
      date: t.date,
      note: t.note,
      postings: [
        { accountId: t.walletId, amount },
        { accountId: `category:${t.categoryId}`, amount: -amount },
      ],
    });
  }
  for (const t of ledger.transfers)
    entries.push({
      id: `transfer_${t.id}`,
      date: t.date,
      note: t.note,
      postings: [
        { accountId: t.sourceWalletId, amount: -t.amount },
        { accountId: t.targetWalletId, amount: t.amount },
      ],
    });
  for (const entry of entries)
    if (safeSum(entry.postings.map((p) => p.amount)) !== 0)
      throw new Error("Jurnal tidak seimbang.");
  return entries;
}
export function balancesAt(ledger: Ledger, until: string) {
  const balances = new Map(ledger.wallets.map((w) => [w.id, w.openingBalance]));
  const add = (id: string, amount: number) =>
    balances.set(id, safeSum([balances.get(id) ?? 0, amount]));
  for (const t of ledger.transactions)
    if (t.date <= until)
      add(t.walletId, t.kind === "income" || t.refund ? t.amount : -t.amount);
  for (const t of ledger.transfers)
    if (t.date <= until) {
      add(t.sourceWalletId, -t.amount);
      add(t.targetWalletId, t.amount);
    }
  return balances;
}
export function position(ledger: Ledger, until = "9999-12-31") {
  const balances = balancesAt(ledger, until);
  const assets = safeSum(
    ledger.wallets
      .filter((w) => !isLiability(w))
      .map((w) => balances.get(w.id) ?? 0),
  );
  const debt = safeSum(
    ledger.wallets.filter(isLiability).map((w) => -(balances.get(w.id) ?? 0)),
  );
  return { assets, debt, netWorth: safeSum([assets, -debt]), balances };
}
