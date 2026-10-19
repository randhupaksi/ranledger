import { MAX_AMOUNT, MAX_ROWS, validDate } from "../domain/ledger";
import type { Ledger, Transaction, TransactionKind } from "../domain/ledger";

export interface CsvData {
  headers: string[];
  rows: string[][];
  delimiter: string;
}
export interface CsvMapping {
  date: number;
  amount: number;
  note: number;
  kind: number;
  category: number;
  debit: number;
  credit: number;
  direction: "expense" | "income" | "signed" | "column" | "debit-credit";
  dateFormat: "iso" | "dmy" | "mdy";
  numberFormat: "id" | "en" | "plain";
  walletId: string;
  incomeCategoryId: string;
  expenseCategoryId: string;
}
export interface CsvPreviewRow {
  matchedId?: string;
  similarId?: string;
  reconciled?: boolean;
  line: number;
  transaction: Transaction | null;
  error: string;
  duplicate: boolean;
  include: boolean;
}
export function parseCsv(text: string, delimiter?: string): CsvData {
  if (text.length > 16 * 1024 * 1024)
    throw new Error("Ukuran CSV maksimal 16 MB.");
  text = text.replace(/^\uFEFF/, "");
  if (!delimiter) {
    const first = text.split(/\r?\n/, 1)[0];
    const count = (candidate: string) => {
      let quoted = false,
        hits = 0;
      for (let i = 0; i < first.length; i++) {
        if (first[i] === '"') {
          if (quoted && first[i + 1] === '"') i++;
          else quoted = !quoted;
        } else if (!quoted && first[i] === candidate) hits++;
      }
      return hits;
    };
    delimiter = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];
  }
  if (![",", ";", "\t"].includes(delimiter))
    throw new Error("Pemisah CSV tidak didukung.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const finishRow = () => {
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > 100) throw new Error("CSV maksimal 100 kolom.");
    if (row.some((v) => v.trim() !== "")) rows.push(row);
    if (rows.length > MAX_ROWS + 1)
      throw new Error("CSV maksimal 100.000 baris data.");
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
      closed = false;
      if (row.length > 100) throw new Error("CSV maksimal 100 kolom.");
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      finishRow();
    } else if (char === '"' && cell === "" && !closed) quoted = true;
    else if (closed) {
      if (char !== " " && char !== "\t")
        throw new Error("Teks setelah tanda kutip CSV tidak valid.");
    } else {
      if (char === '"') throw new Error("Tanda kutip CSV tidak valid.");
      cell += char;
    }
    if (cell.length > 10_000)
      throw new Error("Isi salah satu sel CSV terlalu panjang.");
  }
  if (quoted) throw new Error("Tanda kutip CSV belum ditutup.");
  if (cell !== "" || row.length) finishRow();
  if (rows.length < 2)
    throw new Error("CSV memerlukan judul kolom dan minimal satu baris data.");
  const headers = rows.shift()!.map((v) => v.trim());
  if (headers.some((v) => !v) || new Set(headers).size !== headers.length)
    throw new Error("Judul kolom CSV harus terisi dan berbeda.");
  return { headers, rows, delimiter };
}
export function csvAmount(
  raw: string,
  format: CsvMapping["numberFormat"],
): number {
  const value = raw.trim().replace(/^Rp\s*/i, "");
  const pattern =
    format === "id"
      ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,0+)?$/
      : format === "en"
        ? /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/
        : /^-?\d+$/;
  if (!pattern.test(value))
    throw new Error(
      "Nominal tidak sesuai format angka atau mengandung pecahan rupiah.",
    );
  const cleaned =
    format === "id"
      ? value.split(",")[0].replace(/\./g, "")
      : format === "en"
        ? value.split(".")[0].replace(/,/g, "")
        : value;
  const amount = Number(cleaned);
  if (!Number.isSafeInteger(amount) || Math.abs(amount) > MAX_AMOUNT)
    throw new Error("Nominal melampaui Rp1 triliun.");
  return amount;
}
export function csvDate(raw: string, format: CsvMapping["dateFormat"]) {
  const value = raw.trim();
  let result = value;
  if (format !== "iso") {
    const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
    if (!match) throw new Error("Tanggal tidak sesuai format pilihan.");
    result = `${match[3]}-${(format === "dmy" ? match[2] : match[1]).padStart(2, "0")}-${(format === "dmy" ? match[1] : match[2]).padStart(2, "0")}`;
  }
  if (!validDate(result)) throw new Error("Tanggal tidak valid.");
  return result;
}
export function transactionFingerprint(t: Transaction) {
  return JSON.stringify([
    t.date,
    t.kind,
    t.amount,
    t.walletId,
    Boolean(t.refund),
    t.note.trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " "),
  ]);
}
export function buildCsvPreview(
  data: CsvData,
  mapping: CsvMapping,
  ledger: Ledger,
): CsvPreviewRow[] {
  const fingerprints = new Set(ledger.transactions.map(transactionFingerprint));
  const matches = new Map(
    ledger.transactions.map((t) => [transactionFingerprint(t), t.id]),
  );
  const similar = new Map(
    ledger.transactions.map((t) => [
      JSON.stringify([t.date, t.kind, t.amount, t.walletId]),
      t.id,
    ]),
  );
  const categories = new Map(
    ledger.categories
      .filter((c) => !c.archived)
      .map((c) => [`${c.kind}:${c.name.toLocaleLowerCase("id-ID")}`, c.id]),
  );
  const at = new Date().toISOString();
  const validCategories = new Map(
    ledger.categories.filter((c) => !c.archived).map((c) => [c.id, c.kind]),
  );
  if (
    mapping.date < 0 ||
    (mapping.direction === "debit-credit"
      ? mapping.debit < 0 ||
        mapping.credit < 0 ||
        mapping.debit === mapping.credit
      : mapping.amount < 0) ||
    (mapping.direction === "column" && mapping.kind < 0)
  )
    throw new Error(
      "Lengkapi pemetaan tanggal, nominal, dan jenis yang diperlukan.",
    );
  if (!ledger.wallets.some((w) => w.id === mapping.walletId && !w.archived))
    throw new Error("Pilih dompet aktif untuk impor.");
  return data.rows.map((cells, index) => {
    try {
      if (cells.length !== data.headers.length)
        throw new Error("Jumlah kolom baris berbeda dari judul CSV.");
      const get = (col: number) => (col >= 0 ? (cells[col] ?? "").trim() : "");
      const date = csvDate(get(mapping.date), mapping.dateFormat);
      let kind: TransactionKind = "expense",
        amount: number;
      if (mapping.direction === "debit-credit") {
        const debit = get(mapping.debit)
          ? csvAmount(get(mapping.debit), mapping.numberFormat)
          : 0;
        const credit = get(mapping.credit)
          ? csvAmount(get(mapping.credit), mapping.numberFormat)
          : 0;
        if (debit < 0 || credit < 0 || debit > 0 === credit > 0)
          throw new Error(
            "Isi hanya salah satu nominal debit atau kredit positif.",
          );
        kind = credit > 0 ? "income" : "expense";
        amount = credit || debit;
      } else {
        amount = csvAmount(get(mapping.amount), mapping.numberFormat);
        if (mapping.direction === "signed")
          kind = amount < 0 ? "expense" : "income";
        else if (mapping.direction === "column") {
          const type = get(mapping.kind).toLocaleLowerCase("id-ID");
          if (
            ["income", "pemasukan", "masuk", "credit", "kredit"].includes(type)
          )
            kind = "income";
          else if (
            !["expense", "pengeluaran", "keluar", "debit"].includes(type)
          )
            throw new Error(
              "Jenis harus pemasukan/income/kredit atau pengeluaran/expense/debit.",
            );
          if (amount < 0)
            throw new Error(
              "Pemetaan jenis terpisah memerlukan nominal positif.",
            );
        } else {
          kind = mapping.direction;
          if (amount < 0)
            throw new Error(
              "Gunakan mode nominal bertanda untuk angka negatif.",
            );
        }
        amount = Math.abs(amount);
      }
      if (amount === 0) throw new Error("Nominal harus lebih dari nol.");
      let categoryId =
        categories.get(
          `${kind}:${get(mapping.category).toLocaleLowerCase("id-ID")}`,
        ) ??
        (kind === "income"
          ? mapping.incomeCategoryId
          : mapping.expenseCategoryId);
      if (validCategories.get(categoryId) !== kind)
        throw new Error("Pilih kategori default yang sesuai untuk jenis ini.");
      const note = get(mapping.note);
      const rule = ledger.rules.find(
        (r) =>
          r.enabled &&
          r.kind === kind &&
          note
            .toLocaleLowerCase("id-ID")
            .includes(r.contains.toLocaleLowerCase("id-ID")) &&
          validCategories.get(r.categoryId) === kind,
      );
      if (rule) categoryId = rule.categoryId;
      if (note.length > 500) throw new Error("Catatan maksimal 500 karakter.");
      const transaction: Transaction = {
        id: crypto.randomUUID(),
        kind,
        amount,
        categoryId,
        walletId: mapping.walletId,
        date,
        note,
        createdAt: at,
        updatedAt: at,
      };
      const fingerprint = transactionFingerprint(transaction);
      const duplicate = fingerprints.has(fingerprint);
      fingerprints.add(fingerprint);
      return {
        line: index + 2,
        transaction,
        error: "",
        duplicate,
        matchedId: matches.get(fingerprint),
        similarId: similar.get(
          JSON.stringify([date, kind, amount, mapping.walletId]),
        ),
        include: !duplicate,
      };
    } catch (e) {
      return {
        line: index + 2,
        transaction: null,
        error: e instanceof Error ? e.message : "Baris tidak valid.",
        duplicate: false,
        include: false,
      };
    }
  });
}
