import { localDate, safeSum, totals, validDate } from "./ledger";
import type { Budget, Ledger, RecurringSchedule, Wallet } from "./ledger";

export function walletBalances(ledger: Ledger): Map<string, number> {
  const balances = new Map(ledger.wallets.map((w) => [w.id, w.openingBalance]));
  for (const t of ledger.transactions)
    balances.set(
      t.walletId,
      safeSum([
        balances.get(t.walletId) ?? 0,
        t.kind === "income" || t.refund ? t.amount : -t.amount,
      ]),
    );
  for (const t of ledger.transfers) {
    balances.set(
      t.sourceWalletId,
      safeSum([balances.get(t.sourceWalletId) ?? 0, -t.amount]),
    );
    balances.set(
      t.targetWalletId,
      safeSum([balances.get(t.targetWalletId) ?? 0, t.amount]),
    );
  }
  return balances;
}
export function ledgerTotals(ledger: Pick<Ledger, "transactions" | "wallets">) {
  return totals(
    ledger.transactions,
    safeSum(ledger.wallets.map((w) => w.openingBalance)),
  );
}
export function budgetProgress(budget: Budget, ledger: Ledger) {
  return budgetProgresses([budget], ledger).get(budget.id)!;
}
export function budgetProgresses(budgets: Budget[], ledger: Ledger) {
  const usage = new Map<string, number>();
  const months = new Set(budgets.map((b) => b.month));
  for (const t of ledger.transactions) {
    const month = t.date.slice(0, 7);
    if (t.kind !== "expense" || !months.has(month)) continue;
    for (const wallet of ["*", t.walletId]) {
      const key = `${month}:${t.categoryId}:${wallet}`;
      usage.set(
        key,
        safeSum([usage.get(key) ?? 0, t.refund ? -t.amount : t.amount]),
      );
    }
  }
  return new Map(
    budgets.map((b) => [
      b.id,
      progress(
        b,
        usage.get(`${b.month}:${b.categoryId}:${b.walletId ?? "*"}`) ?? 0,
      ),
    ]),
  );
}
function progress(budget: Budget, spent: number) {
  return {
    spent,
    remaining: budget.amount - spent,
    ratio: spent / budget.amount,
    status:
      spent >= budget.amount
        ? "over"
        : spent >= budget.amount * 0.8
          ? "near"
          : "normal",
  };
}
export function nextOccurrence(schedule: RecurringSchedule): string {
  const [year, month, day] = schedule.nextDate.split("-").map(Number);
  const [, anchorMonth, anchorDay] = schedule.anchorDate.split("-").map(Number);
  let next: Date;
  if (schedule.frequency === "weekly")
    next = new Date(year, month - 1, day + 7, 12);
  else {
    const nextYear = year + (schedule.frequency === "yearly" ? 1 : 0);
    const nextMonth = schedule.frequency === "yearly" ? anchorMonth - 1 : month;
    const end = new Date(nextYear, nextMonth + 1, 0, 12).getDate();
    next = new Date(nextYear, nextMonth, Math.min(anchorDay, end), 12);
  }
  const value = localDate(next);
  if (!validDate(value))
    throw new Error("Jadwal telah mencapai batas tanggal yang didukung.");
  return value;
}
export function dueSchedules(ledger: Ledger, until = localDate()) {
  return ledger.schedules
    .filter((s) => s.active && s.nextDate <= until)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}
export function canUseWallet(wallet: Wallet | undefined) {
  if (!wallet || wallet.archived)
    throw new Error("Pilih dompet aktif untuk catatan baru.");
}
export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00`));
}
