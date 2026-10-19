import { localDate, safeSum, validDate, type Ledger } from "./ledger";
import { nextOccurrence } from "./planning";
import { balancesAt, isLiability } from "./finance";
export interface CalendarItem {
  id: string;
  date: string;
  name: string;
  walletId: string;
  amount: number;
  kind: "income" | "expense" | "payment" | "goal";
  source:
    "transaction" | "transfer" | "schedule" | "liability" | "scenario" | "goal";
  targetWalletId?: string;
}
export function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export function monthDate(month: string, day: number) {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(Math.min(day, new Date(y, m, 0).getDate())).padStart(2, "0")}`;
}
export function calendarItems(
  ledger: Ledger,
  start: string,
  end: string,
): CalendarItem[] {
  const rows: CalendarItem[] = ledger.transactions
    .filter((t) => t.date >= start && t.date <= end)
    .map((t) => ({
      id: t.id,
      date: t.date,
      name:
        t.note ||
        (t.refund
          ? "Refund"
          : t.kind === "income"
            ? "Pemasukan"
            : "Pengeluaran"),
      walletId: t.walletId,
      amount: t.amount,
      kind: t.refund ? "income" : t.kind,
      source: "transaction",
    }));
  for (const t of ledger.transfers)
    if (t.date >= start && t.date <= end)
      rows.push({
        id: t.id,
        date: t.date,
        name: t.note || "Transfer terjadwal",
        walletId: t.sourceWalletId,
        targetWalletId: t.targetWalletId,
        amount: t.amount,
        kind: "payment",
        source: "transfer",
      });
  const recorded = new Set(
    ledger.transactions.flatMap((t) =>
      t.occurrenceKey ? [t.occurrenceKey] : [],
    ),
  );
  for (const schedule of ledger.schedules.filter((s) => s.active)) {
    let s = { ...schedule };
    let guard = 0;
    while (
      s.nextDate <= end &&
      (!s.endDate || s.nextDate <= s.endDate) &&
      guard++ < 10_000
    ) {
      if (s.nextDate >= start && !recorded.has(`${s.id}:${s.nextDate}`))
        rows.push({
          id: `${s.id}:${s.nextDate}`,
          date: s.nextDate,
          name: s.name,
          walletId: s.walletId,
          amount: s.amount,
          kind: s.kind,
          source: "schedule",
        });
      s = { ...s, nextDate: nextOccurrence(s) };
    }
  }
  const balances = balancesAt(ledger, addDays(start, -1));
  const knownEvents = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const eventsByAccount = new Map<string, { date: string; amount: number }[]>();
  for (const event of knownEvents) {
    const a = eventsByAccount.get(event.walletId) ?? [];
    a.push({
      date: event.date,
      amount: event.kind === "income" ? -event.amount : event.amount,
    });
    eventsByAccount.set(event.walletId, a);
    if (event.targetWalletId) {
      const b = eventsByAccount.get(event.targetWalletId) ?? [];
      b.push({ date: event.date, amount: -event.amount });
      eventsByAccount.set(event.targetWalletId, b);
    }
  }
  const paidByMonth = new Map<string, number>();
  for (const transfer of ledger.transfers) {
    const key = `${transfer.targetWalletId}:${transfer.date.slice(0, 7)}`;
    paidByMonth.set(key, safeSum([paidByMonth.get(key) ?? 0, transfer.amount]));
  }
  for (const term of ledger.liabilities) {
    const accountEvents = eventsByAccount.get(term.walletId) ?? [];
    const name =
      ledger.wallets.find((w) => w.id === term.walletId)?.name ?? "Kewajiban";
    let projectedDebt = Math.max(0, -(balances.get(term.walletId) ?? 0));
    const initial = new Date(term.startDate + "T12:00:00");
    if (monthDate(term.startDate.slice(0, 7), term.dueDay) < term.startDate)
      initial.setMonth(initial.getMonth() + 1, 1);
    const first = new Date(start + "T12:00:00");
    let monthOffset = Math.max(
      0,
      (first.getFullYear() - initial.getFullYear()) * 12 +
        first.getMonth() -
        initial.getMonth(),
    );
    let eventIndex = 0;
    for (let guard = 0; guard < 1200; guard++, monthOffset++) {
      if (term.installments && monthOffset >= term.installments) break;
      const d = new Date(
        initial.getFullYear(),
        initial.getMonth() + monthOffset,
        1,
        12,
      );
      const date = monthDate(localDate(d).slice(0, 7), term.dueDay);
      if (date > end) break;
      if (date < start || date < term.startDate) continue;
      while (
        eventIndex < accountEvents.length &&
        accountEvents[eventIndex].date <= date
      ) {
        projectedDebt = safeSum([
          projectedDebt,
          accountEvents[eventIndex++].amount,
        ]);
      }
      projectedDebt = Math.max(0, projectedDebt);
      const paid = paidByMonth.get(`${term.walletId}:${date.slice(0, 7)}`) ?? 0;
      const amount = Math.min(
        projectedDebt,
        Math.max(0, term.paymentAmount - paid),
      );
      if (amount > 0) {
        rows.push({
          id: `${term.id}:${date}`,
          date,
          name: `Pembayaran ${name}`,
          walletId: term.paymentWalletId,
          targetWalletId: term.walletId,
          amount,
          kind: "payment",
          source: "liability",
        });
        projectedDebt -= amount;
      }
    }
  }
  for (const g of ledger.goals.filter(
    (g) => !g.archived && g.targetDate >= start && g.targetDate <= end,
  ))
    rows.push({
      id: g.id,
      date: g.targetDate,
      name: `Target ${g.name}`,
      walletId: g.walletId,
      amount: Math.max(0, g.amount - (balances.get(g.walletId) ?? 0)),
      kind: "goal",
      source: "goal",
    });
  return rows.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}
export function forecast(
  ledger: Ledger,
  days: number,
  scenario?: CalendarItem,
  today = localDate(),
) {
  const end = addDays(today, days);
  const balances = balancesAt(ledger, today);
  const items = calendarItems(ledger, addDays(today, 1), end).filter(
    (i) => i.kind !== "goal",
  );
  if (
    scenario &&
    validDate(scenario.date) &&
    scenario.date > today &&
    scenario.date <= end
  )
    items.push(scenario);
  items.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const assets = new Set(
    ledger.wallets.filter((w) => !isLiability(w)).map((w) => w.id),
  );
  const total = () =>
    safeSum([...balances].filter(([id]) => assets.has(id)).map(([, v]) => v));
  const startBalance = total();
  const points: { date: string; balance: number; item: CalendarItem }[] = [];
  for (const item of items) {
    balances.set(
      item.walletId,
      safeSum([
        balances.get(item.walletId) ?? 0,
        item.kind === "income" ? item.amount : -item.amount,
      ]),
    );
    if (item.targetWalletId)
      balances.set(
        item.targetWalletId,
        safeSum([balances.get(item.targetWalletId) ?? 0, item.amount]),
      );
    points.push({ date: item.date, balance: total(), item });
  }
  return {
    startBalance,
    endBalance: total(),
    balances,
    points,
    low: points.find((p) => p.balance < 0),
    end,
  };
}
