export const MAX_AMOUNT = 1_000_000_000_000;
export const MAX_ROWS = 100_000;
export type TransactionKind = "income" | "expense";
export type Theme = "light" | "dark" | "system";
export type DateFormat = "long" | "short";
export type Period = "today" | "week" | "month" | "year" | "all" | "custom";
export interface DateRange {
  start: string;
  end: string;
}
export interface Category {
  id: string;
  name: string;
  kind: TransactionKind;
  archived: boolean;
}
export interface Transaction {
  id: string;
  kind: TransactionKind;
  amount: number;
  categoryId: string;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}
export interface Preferences {
  openingBalance: number;
  theme: Theme;
  dateFormat: DateFormat;
  hideAmounts: boolean;
  onboarded: boolean;
  lastBackupAt: string | null;
}
export interface Ledger {
  transactions: Transaction[];
  categories: Category[];
  preferences: Preferences;
  revision: number;
}
export interface CategoryTotal {
  id: string;
  amount: number;
  name: string;
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(y, m - 1, d, 12);
  return y >= 1900 && y <= 9999 && localDate(parsed) === value;
}
export const defaultPreferences: Preferences = {
  openingBalance: 0,
  theme: "system",
  dateFormat: "long",
  hideAmounts: false,
  onboarded: false,
  lastBackupAt: null,
};
export const defaultCategories: Category[] = [
  ["food", "Makan & Minum", "expense"],
  ["transport", "Transportasi", "expense"],
  ["shopping", "Belanja", "expense"],
  ["entertainment", "Hiburan", "expense"],
  ["health", "Kesehatan", "expense"],
  ["education", "Pendidikan", "expense"],
  ["bills", "Tagihan", "expense"],
  ["other-expense", "Lainnya", "expense"],
  ["salary", "Gaji/Freelance", "income"],
  ["gift", "Hadiah", "income"],
  ["other-income", "Lainnya", "income"],
].map(([id, name, kind]) => ({
  id,
  name,
  kind: kind as TransactionKind,
  archived: false,
}));

export function emptyLedger(): Ledger {
  return {
    transactions: [],
    categories: defaultCategories.map((c) => ({ ...c })),
    preferences: { ...defaultPreferences },
    revision: 0,
  };
}
export function safeSum(values: number[]): number {
  return values.reduce((sum, value) => {
    const next = sum + value;
    if (!Number.isSafeInteger(next))
      throw new Error(
        "Total nominal melampaui batas hitung aman. Kurangi nilai atau jumlah catatan.",
      );
    return next;
  }, 0);
}
export function totals(transactions: Transaction[], openingBalance = 0) {
  let income = 0;
  let expense = 0;
  for (const transaction of transactions) {
    if (transaction.kind === "income") {
      income += transaction.amount;
    } else {
      expense += transaction.amount;
    }
    if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expense))
      throw new Error(
        "Total nominal melampaui batas hitung aman. Kurangi nilai atau jumlah catatan.",
      );
  }
  return {
    income,
    expense,
    net: safeSum([income, -expense]),
    balance: safeSum([openingBalance, income, -expense]),
  };
}
export function parseAmount(value: string, allowNegative = false): number {
  const trimmed = value.trim();
  const valid = allowNegative
    ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)$/
    : /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/;
  if (!valid.test(trimmed))
    throw new Error(
      "Isi rupiah bulat, misalnya 25.000. Jangan gunakan desimal atau tanda lain.",
    );
  const cleaned = trimmed.replace(/\./g, "");
  const amount = Number(cleaned);
  if (
    !Number.isSafeInteger(amount) ||
    Math.abs(amount) > MAX_AMOUNT ||
    (!allowNegative && amount <= 0)
  ) {
    throw new Error(
      allowNegative
        ? "Saldo awal harus berupa rupiah bulat, maksimal ±Rp1 triliun."
        : "Nominal harus lebih dari Rp0 dan maksimal Rp1 triliun.",
    );
  }
  return amount;
}
const moneyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const dateFormatters: Record<DateFormat, Intl.DateTimeFormat> = {
  long: new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }),
  short: new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }),
};
export function money(amount: number, hidden = false): string {
  return hidden ? "Rp ••••••" : moneyFormatter.format(amount);
}
export function dateLabel(value: string, format: DateFormat = "long"): string {
  const [y, m, d] = value.split("-").map(Number);
  return dateFormatters[format].format(new Date(y, m - 1, d, 12));
}
export function dateRange(
  period: Period,
  custom?: DateRange,
  now = new Date(),
): DateRange {
  const end = localDate(now);
  if (period === "all") return { start: "1900-01-01", end: "9999-12-31" };
  if (period === "custom") return custom ?? { start: end, end };
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (period === "week")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === "month") start.setDate(1);
  if (period === "year") {
    start.setMonth(0);
    start.setDate(1);
  }
  return { start: localDate(start), end };
}
export interface Filters extends DateRange {
  kind: TransactionKind | "all";
  categoryId: string;
  search: string;
}
const sortedTransactions = new WeakMap<Transaction[], Transaction[]>();
function orderedTransactions(transactions: Transaction[]) {
  const cached = sortedTransactions.get(transactions);
  if (cached) return cached;
  const ordered = [...transactions].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
  sortedTransactions.set(transactions, ordered);
  return ordered;
}
export function filterTransactions(
  transactions: Transaction[],
  categories: Category[],
  filter: Filters,
): Transaction[] {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const search = filter.search.toLocaleLowerCase("id-ID").trim();
  return orderedTransactions(transactions).filter(
    (transaction) =>
      transaction.date >= filter.start &&
      transaction.date <= filter.end &&
      (filter.kind === "all" || transaction.kind === filter.kind) &&
      (!filter.categoryId || transaction.categoryId === filter.categoryId) &&
      (!search ||
        `${transaction.note} ${names.get(transaction.categoryId) ?? ""}`
          .toLocaleLowerCase("id-ID")
          .includes(search)),
  );
}
export function categoryTotals(
  transactions: Transaction[],
  categories: Category[],
  kind: TransactionKind = "expense",
): CategoryTotal[] {
  const map = new Map<string, number>();
  for (const t of transactions)
    if (t.kind === kind)
      map.set(t.categoryId, safeSum([map.get(t.categoryId) ?? 0, t.amount]));
  const names = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  return [...map.entries()]
    .map(([id, amount]) => ({ id, amount, name: names.get(id) ?? "Kategori" }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "ZodError")
    return "Isi data tidak sesuai format Ranledger. Periksa nominal, tanggal, kategori, dan versi file.";
  if (error instanceof Error) {
    if (/quota/i.test(error.name + error.message))
      return "Penyimpanan perangkat penuh. Buat backup, kosongkan ruang perangkat, lalu coba lagi.";
    if (
      /indexeddb|databaseclosed|invalidstate|openfailed/i.test(
        error.name + error.message,
      )
    )
      return "Penyimpanan browser tidak tersedia. Gunakan mode browser biasa dan izinkan penyimpanan situs, lalu muat ulang.";
    return error.message;
  }
  return "Proses belum berhasil. Data lama tetap tersimpan. Silakan coba lagi.";
}
