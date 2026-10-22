import { colors, stylesXml } from "./report-excel/style-definition";
import {
  addTabColor,
  applyCellStyles,
  styleSheetView,
} from "./report-excel/worksheet-xml";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { totals } from "../domain/ledger";
import type { Ledger, Transaction } from "../domain/ledger";

type Value = string | number | boolean | null | undefined;
type Cell = { value: Value; style: number };
type SheetOptions = {
  name: string;
  widths: number[];
  tabColor: string;
  frozenRows?: number;
  autoFilter?: string;
};

class SheetBuilder {
  readonly rows = new Map<number, Map<number, Cell>>();
  readonly merges: string[] = [];
  readonly rowHeights = new Map<number, number>();

  constructor(readonly options: SheetOptions) {}

  set(row: number, column: number, value: Value, style = 0) {
    const cells = this.rows.get(row) ?? new Map<number, Cell>();
    cells.set(column, { value, style });
    this.rows.set(row, cells);
  }

  styleRange(
    startRow: number,
    startColumn: number,
    endRow: number,
    endColumn: number,
    style: number,
  ) {
    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        const cell = this.rows.get(row)?.get(column);
        this.set(row, column, cell?.value, style);
      }
    }
  }

  merged(
    row: number,
    startColumn: number,
    endColumn: number,
    value: Value,
    style: number,
  ) {
    if (startColumn < endColumn)
      this.merges.push(
        `${cellAddress(row, startColumn)}:${cellAddress(row, endColumn)}`,
      );
    this.styleRange(row, startColumn, row, endColumn, style);
    this.set(row, startColumn, value, style);
  }
}

type CategorySummary = {
  id: string;
  name: string;
  kind: "income" | "expense";
  count: number;
  income: number;
  grossExpense: number;
  refunds: number;
  netExpense: number;
  netImpact: number;
};

type WalletSummary = {
  id: string;
  name: string;
  count: number;
  income: number;
  grossExpense: number;
  refunds: number;
  netExpense: number;
  netImpact: number;
};

export async function createStyledReportWorkbook(
  transactions: Transaction[],
  ledger: Ledger,
  rangeLabel: string,
): Promise<ArrayBuffer> {
  const summary = totals(transactions);
  const categories = summarizeCategories(transactions, ledger);
  const wallets = summarizeWallets(transactions, ledger);
  const generatedAt = new Date();
  const sheets = [
    createSummarySheet(
      summary,
      transactions.length,
      rangeLabel,
      generatedAt,
      categories,
      wallets,
    ),
    createTransactionsSheet(transactions, ledger, rangeLabel),
    createCategoriesSheet(categories, rangeLabel),
  ];
  return writeStyledWorkbook(sheets);
}

async function writeStyledWorkbook(
  sheets: SheetBuilder[],
): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const cellStyles: Map<string, number>[] = [];
  for (const sheet of sheets) {
    const { worksheet, styles: stylesForSheet } = createWorksheet(sheet, XLSX);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.options.name);
    cellStyles.push(stylesForSheet);
  }

  const original = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    compression: true,
    cellStyles: true,
  }) as ArrayBuffer;
  const files = unzipSync(new Uint8Array(original));
  files["xl/styles.xml"] = strToU8(stylesXml());
  workbook.SheetNames.forEach((_, index) => {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    let xml = strFromU8(files[path]);
    xml = applyCellStyles(xml, cellStyles[index]);
    xml = addTabColor(xml, sheets[index].options.tabColor);
    xml = styleSheetView(xml, sheets[index].options.frozenRows);
    files[path] = strToU8(xml);
  });

  const output = zipSync(files, { level: 6 });
  const result = new Uint8Array(output.byteLength);
  result.set(output);
  return result.buffer;
}

export async function createImportTemplate(): Promise<ArrayBuffer> {
  const sheet = new SheetBuilder({
    name: "Transaksi",
    widths: [20, 20, 22, 28, 48],
    tabColor: colors.forestMid,
    frozenRows: 7,
    autoFilter: "A7:E9",
  });
  sheet.merged(1, 1, 5, "RANLEDGER  /  KEUANGAN PRIBADI", 39);
  sheet.merged(2, 1, 5, "TEMPLATE IMPOR TRANSAKSI", 40);
  sheet.merged(
    3,
    1,
    5,
    "Tambahkan riwayat transaksi, lalu impor file ini ke Ranledger.",
    41,
  );
  sheet.merged(
    4,
    1,
    5,
    "FORMAT TANGGAL  YYYY-MM-DD     ·     NOMINAL  RUPIAH UTUH     ·     KATEGORI DAN CATATAN OPSIONAL",
    42,
  );
  sheet.merged(
    5,
    1,
    5,
    "Ganti atau hapus dua baris contoh sebelum mengimpor.",
    44,
  );
  sheet.merged(
    6,
    1,
    5,
    "DATA TRANSAKSI  /  1 BARIS UNTUK SETIAP TRANSAKSI",
    43,
  );
  ["Tanggal", "Jenis", "Nominal", "Kategori", "Catatan"].forEach(
    (value, index) => sheet.set(7, index + 1, value, 17),
  );
  [20, 42, 29, 30, 26, 25, 34].forEach((height, index) =>
    sheet.rowHeights.set(index + 1, height),
  );
  const examples = [
    ["2026-01-01", "Pengeluaran", 25000, "Makan & Minum", "Makan siang"],
    ["2026-01-02", "Pemasukan", 1000000, "Gaji/Freelance", "Proyek"],
  ];
  examples.forEach((row, index) => {
    const rowNumber = index + 8;
    const alternate = index % 2 === 1;
    row.forEach((value, column) => {
      const style =
        column === 1
          ? index === 0
            ? 36
            : 35
          : column === 2
            ? alternate
              ? 21
              : 20
            : alternate
              ? 19
              : 18;
      sheet.set(rowNumber, column + 1, value, style);
    });
    sheet.rowHeights.set(rowNumber, 29);
  });
  const guide = new SheetBuilder({
    name: "Panduan",
    widths: [25, 25, 25, 25, 25],
    tabColor: colors.gold,
  });
  guide.merged(1, 1, 5, "RANLEDGER  /  TEMPLATE IMPOR", 39);
  guide.merged(2, 1, 5, "Panduan Mengisi Template", 40);
  guide.merged(
    3,
    1,
    5,
    "Isi data di lembar Transaksi, lalu pilih file ini di Ranledger.",
    41,
  );
  guide.rowHeights.set(1, 24);
  guide.rowHeights.set(2, 38);
  guide.rowHeights.set(3, 30);
  const tips = [
    "Ganti atau hapus dua baris contoh sebelum mengimpor.",
    "Tanggal: gunakan YYYY-MM-DD, atau tanggal Excel yang valid.",
    "Jenis: tulis pemasukan atau pengeluaran.",
    "Nominal: isi angka rupiah tanpa pecahan, misalnya 25000.",
    "Kategori dan catatan bersifat opsional. Periksa pratinjau sebelum menyimpan.",
    "Pertahankan nama kolom pada bagian Data Transaksi di lembar Transaksi.",
  ];
  tips.forEach((tip, index) => {
    guide.merged(index + 5, 1, 5, tip, index % 2 ? 19 : 18);
    guide.rowHeights.set(index + 5, 28);
  });
  return writeStyledWorkbook([sheet, guide]);
}

function createWorksheet(sheet: SheetBuilder, XLSX: typeof import("xlsx")) {
  let lastRow = 1;
  for (const row of sheet.rows.keys()) lastRow = Math.max(lastRow, row);
  const columns = sheet.options.widths.length;
  const rows = Array.from({ length: lastRow }, (_, rowIndex) =>
    Array.from({ length: columns }, (_, columnIndex) =>
      sheet.rows.get(rowIndex + 1)?.has(columnIndex + 1)
        ? (sheet.rows.get(rowIndex + 1)?.get(columnIndex + 1)?.value ?? "")
        : null,
    ),
  );
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: lastRow - 1, c: columns - 1 },
  });
  worksheet["!cols"] = sheet.options.widths.map((wch) => ({ wch }));
  worksheet["!merges"] = sheet.merges.map((range) =>
    XLSX.utils.decode_range(range),
  );
  if (sheet.options.autoFilter)
    worksheet["!autofilter"] = { ref: sheet.options.autoFilter };

  const rowInfo: NonNullable<(typeof worksheet)["!rows"]> = [];
  for (const [row, hpt] of sheet.rowHeights) rowInfo[row - 1] = { hpt };
  worksheet["!rows"] = rowInfo;

  const cellStyles = new Map<string, number>();
  for (const [row, cells] of sheet.rows)
    for (const [column, cell] of cells)
      if (cell.style) cellStyles.set(cellAddress(row, column), cell.style);

  return { worksheet, styles: cellStyles };
}

function createSummarySheet(
  summary: ReturnType<typeof totals>,
  transactionCount: number,
  rangeLabel: string,
  generatedAt: Date,
  categories: CategorySummary[],
  wallets: WalletSummary[],
) {
  const sheet = new SheetBuilder({
    name: "Ringkasan",
    widths: [20, 5, 15, 17, 18, 14, 19, 18],
    tabColor: colors.forest,
  });
  sheet.merged(2, 1, 8, "RANLEDGER  /  LAPORAN KEUANGAN", 39);
  sheet.merged(3, 1, 8, "Laporan Keuangan Ranledger", 40);
  sheet.merged(4, 1, 8, safeText(rangeLabel), 41);
  sheet.set(5, 1, "DIEKSPOR", 45);
  sheet.merged(5, 2, 3, excelDateTime(generatedAt), 47);
  sheet.set(5, 4, "JUMLAH CATATAN", 45);
  sheet.set(5, 5, transactionCount, 46);
  sheet.set(5, 6, "MATA UANG", 45);
  sheet.merged(5, 7, 8, "IDR  /  Rupiah", 42);

  sheet.merged(7, 1, 8, "RINGKASAN PERIODE", 43);
  const metrics = [
    {
      start: 1,
      label: "PEMASUKAN",
      value: summary.income,
      labelStyle: 7,
      valueStyle: 8,
    },
    {
      start: 3,
      label: "PENGELUARAN BERSIH",
      value: summary.expense,
      labelStyle: 9,
      valueStyle: 10,
    },
    {
      start: 5,
      label: "SELISIH",
      value: summary.net,
      labelStyle: summary.net < 0 ? 13 : 11,
      valueStyle: summary.net < 0 ? 14 : 12,
    },
    {
      start: 7,
      label: "JUMLAH CATATAN",
      value: transactionCount,
      labelStyle: 15,
      valueStyle: 16,
    },
  ];
  for (const metric of metrics) {
    sheet.merged(
      8,
      metric.start,
      metric.start + 1,
      metric.label,
      metric.labelStyle,
    );
    sheet.merged(
      9,
      metric.start,
      metric.start + 1,
      metric.value,
      metric.valueStyle,
    );
  }

  sheet.merged(11, 1, 8, "PENGELUARAN PER KATEGORI", 43);
  const categoryHeaders = [
    { start: 1, end: 4, label: "Kategori" },
    { start: 5, end: 6, label: "Jumlah catatan" },
    { start: 7, end: 8, label: "Pengeluaran bersih" },
  ];
  for (const header of categoryHeaders)
    sheet.merged(
      12,
      header.start,
      header.end,
      titleCaseHeader(header.label),
      17,
    );
  const topCategories = categories
    .filter((category) => category.kind === "expense")
    .sort(
      (a, b) => b.grossExpense - a.grossExpense || a.name.localeCompare(b.name),
    )
    .slice(0, 5);
  if (topCategories.length) {
    topCategories.forEach((category, index) => {
      const row = 13 + index;
      const textStyle = index % 2 ? 19 : 18;
      const amountStyle = index % 2 ? 21 : 20;
      sheet.merged(row, 1, 4, category.name, textStyle);
      sheet.merged(row, 5, 6, category.count, index % 2 ? 29 : 28);
      sheet.merged(row, 7, 8, category.netExpense, amountStyle);
    });
  } else {
    sheet.merged(
      13,
      1,
      8,
      "Tidak ada catatan pengeluaran pada cakupan ini.",
      30,
    );
  }

  const walletSectionRow = topCategories.length ? 19 : 16;
  const walletHeaderRow = walletSectionRow + 1;
  sheet.merged(walletSectionRow, 1, 8, "ARUS TRANSAKSI PER DOMPET", 43);
  sheet.merged(walletHeaderRow, 1, 2, "Dompet", 17);
  const walletHeaders = [
    "Catatan",
    "Pemasukan",
    "Pengeluaran kotor",
    "Refund",
    "Pengeluaran bersih",
    "Dampak bersih",
  ];
  walletHeaders.forEach((label, index) =>
    sheet.set(walletHeaderRow, index + 3, titleCaseHeader(label), 17),
  );
  if (wallets.length) {
    wallets.forEach((wallet, index) => {
      const row = walletHeaderRow + 1 + index;
      const alternate = index % 2 === 1;
      sheet.merged(row, 1, 2, wallet.name, alternate ? 19 : 18);
      sheet.set(row, 3, wallet.count, alternate ? 29 : 28);
      sheet.set(row, 4, wallet.income, alternate ? 21 : 20);
      sheet.set(row, 5, wallet.grossExpense, alternate ? 21 : 20);
      sheet.set(row, 6, wallet.refunds, alternate ? 21 : 20);
      sheet.set(row, 7, wallet.netExpense, alternate ? 21 : 20);
      sheet.set(
        row,
        8,
        wallet.netImpact,
        signedStyle(wallet.netImpact, alternate),
      );
    });
  } else {
    sheet.merged(
      walletHeaderRow + 1,
      1,
      8,
      "Tidak ada catatan transaksi pada cakupan ini.",
      30,
    );
  }

  const noteRow = walletHeaderRow + Math.max(wallets.length, 1) + 3;
  sheet.merged(
    noteRow,
    1,
    8,
    "Pengeluaran bersih = pengeluaran kotor dikurangi refund. Dampak bersih = pemasukan dikurangi pengeluaran bersih.",
    30,
  );
  sheet.rowHeights.set(2, 18);
  sheet.rowHeights.set(3, 34);
  sheet.rowHeights.set(4, 24);
  sheet.rowHeights.set(8, 21);
  sheet.rowHeights.set(9, 34);
  sheet.rowHeights.set(12, 27);
  sheet.rowHeights.set(walletHeaderRow, 30);
  return sheet;
}

function createTransactionsSheet(
  transactions: Transaction[],
  ledger: Ledger,
  rangeLabel: string,
) {
  const widths = [16, 24, 26, 46, 19, 22, 24];
  const sheet = new SheetBuilder({
    name: "Transaksi",
    widths,
    tabColor: colors.blue,
    frozenRows: 8,
    autoFilter: `A8:G${Math.max(8, transactions.length + 8)}`,
  });
  addDataSheetHeading(
    sheet,
    widths.length,
    "Daftar Transaksi",
    rangeLabel,
    "Nominal berisi jumlah transaksi. Dampak bersih menambah pemasukan dan refund, serta mengurangi pengeluaran.",
    transactions.length,
  );
  const headers = [
    "Tanggal",
    "Jenis",
    "Kategori",
    "Catatan",
    "Nominal (Rp)",
    "Dampak bersih (Rp)",
    "Dompet",
  ];
  addTableHeader(sheet, 8, headers);
  const categoryNames = new Map(
    ledger.categories.map((item) => [item.id, item.name]),
  );
  const walletNames = new Map(
    ledger.wallets.map((item) => [item.id, item.name]),
  );
  transactions.forEach((transaction, index) => {
    const row = index + 9;
    const alternate = index % 2 === 1;
    const impact =
      transaction.kind === "income" || transaction.refund
        ? transaction.amount
        : -transaction.amount;
    sheet.set(row, 1, excelDate(transaction.date), alternate ? 27 : 26);
    sheet.set(
      row,
      2,
      transaction.refund
        ? "Refund Pengeluaran"
        : transaction.kind === "income"
          ? "Pemasukan"
          : "Pengeluaran",
      transaction.refund ? 37 : transaction.kind === "income" ? 35 : 36,
    );
    sheet.set(
      row,
      3,
      categoryNames.get(transaction.categoryId) ?? "Kategori",
      alternate ? 19 : 18,
    );
    sheet.set(row, 4, transaction.note, alternate ? 19 : 18);
    sheet.set(row, 5, transaction.amount, alternate ? 21 : 20);
    sheet.set(row, 6, impact, signedStyle(impact, alternate));
    sheet.set(
      row,
      7,
      walletNames.get(transaction.walletId) ?? "Dompet",
      alternate ? 19 : 18,
    );
  });
  if (transactions.length === 0)
    sheet.merged(
      9,
      1,
      widths.length,
      "Tidak ada transaksi pada cakupan ini.",
      30,
    );
  else {
    const totalRow = transactions.length + 9;
    sheet.merged(
      totalRow,
      1,
      5,
      `TOTAL PERIODE  /  ${transactions.length.toLocaleString("id-ID")} TRANSAKSI`,
      30,
    );
    sheet.set(
      totalRow,
      6,
      totals(transactions).net,
      signedStyle(totals(transactions).net, false),
    );
    sheet.set(totalRow, 7, "", 30);
    sheet.rowHeights.set(totalRow, 30);
  }
  return sheet;
}

function createCategoriesSheet(
  categories: CategorySummary[],
  rangeLabel: string,
) {
  const widths = [28, 18, 17, 20, 22, 16, 22, 22];
  const sheet = new SheetBuilder({
    name: "Kategori",
    widths,
    tabColor: colors.gold,
    frozenRows: 8,
    autoFilter: `A8:H${Math.max(8, categories.length + 8)}`,
  });
  addDataSheetHeading(
    sheet,
    widths.length,
    "Ringkasan Kategori",
    rangeLabel,
    "Refund mengurangi pengeluaran bersih. Dampak bersih menunjukkan kontribusi kategori terhadap selisih periode.",
    categories.length,
  );
  addTableHeader(sheet, 8, [
    "Kategori",
    "Jenis",
    "Jumlah catatan",
    "Pemasukan (Rp)",
    "Pengeluaran kotor (Rp)",
    "Refund (Rp)",
    "Pengeluaran bersih (Rp)",
    "Dampak bersih (Rp)",
  ]);
  const sorted = [...categories].sort(
    (a, b) =>
      b.netExpense - a.netExpense ||
      b.income - a.income ||
      a.name.localeCompare(b.name),
  );
  sorted.forEach((category, index) => {
    const row = index + 9;
    const alternate = index % 2 === 1;
    sheet.set(row, 1, category.name, alternate ? 19 : 18);
    sheet.set(
      row,
      2,
      category.kind === "income" ? "Pemasukan" : "Pengeluaran",
      alternate ? 19 : 18,
    );
    sheet.set(row, 3, category.count, alternate ? 29 : 28);
    sheet.set(row, 4, category.income, alternate ? 21 : 20);
    sheet.set(row, 5, category.grossExpense, alternate ? 21 : 20);
    sheet.set(row, 6, category.refunds, alternate ? 21 : 20);
    sheet.set(row, 7, category.netExpense, alternate ? 21 : 20);
    sheet.set(
      row,
      8,
      category.netImpact,
      signedStyle(category.netImpact, alternate),
    );
  });
  if (categories.length === 0)
    sheet.merged(
      9,
      1,
      widths.length,
      "Belum ada kategori transaksi pada cakupan ini.",
      30,
    );
  else {
    const summary = sorted.reduce(
      (total, category) => ({
        count: total.count + category.count,
        income: total.income + category.income,
        grossExpense: total.grossExpense + category.grossExpense,
        refunds: total.refunds + category.refunds,
        netExpense: total.netExpense + category.netExpense,
        netImpact: total.netImpact + category.netImpact,
      }),
      {
        count: 0,
        income: 0,
        grossExpense: 0,
        refunds: 0,
        netExpense: 0,
        netImpact: 0,
      },
    );
    const totalRow = sorted.length + 9;
    sheet.merged(totalRow, 1, 2, "TOTAL SEMUA KATEGORI", 30);
    sheet.set(totalRow, 3, summary.count, 38);
    sheet.set(totalRow, 4, summary.income, 31);
    sheet.set(totalRow, 5, summary.grossExpense, 31);
    sheet.set(totalRow, 6, summary.refunds, 31);
    sheet.set(totalRow, 7, summary.netExpense, 31);
    sheet.set(
      totalRow,
      8,
      summary.netImpact,
      signedStyle(summary.netImpact, false),
    );
    sheet.rowHeights.set(totalRow, 30);
  }
  return sheet;
}

function addDataSheetHeading(
  sheet: SheetBuilder,
  columnCount: number,
  title: string,
  rangeLabel: string,
  note: string,
  count: number,
) {
  sheet.merged(1, 1, columnCount, "RANLEDGER  /  DATA LAPORAN", 39);
  sheet.merged(2, 1, columnCount, title, 40);
  sheet.merged(3, 1, columnCount, safeText(rangeLabel), 41);
  sheet.merged(
    4,
    1,
    columnCount,
    `Jumlah catatan: ${count.toLocaleString("id-ID")}`,
    42,
  );
  sheet.merged(6, 1, columnCount, "DATA TERPERINCI", 43);
  sheet.merged(7, 1, columnCount, safeText(note), 30);
  sheet.rowHeights.set(1, 18);
  sheet.rowHeights.set(2, 31);
  sheet.rowHeights.set(3, 24);
  sheet.rowHeights.set(7, 32);
  sheet.rowHeights.set(8, 30);
}

function addTableHeader(sheet: SheetBuilder, row: number, labels: string[]) {
  labels.forEach((label, index) =>
    sheet.set(row, index + 1, titleCaseHeader(label), 17),
  );
}

function titleCaseHeader(value: string) {
  return value.replace(
    /(^|[\s(])([\p{L}])/gu,
    (_match, prefix, letter: string) =>
      prefix + letter.toLocaleUpperCase("id-ID"),
  );
}

function summarizeCategories(
  transactions: Transaction[],
  ledger: Ledger,
): CategorySummary[] {
  const definitions = new Map(ledger.categories.map((item) => [item.id, item]));
  const grouped = new Map<string, CategorySummary>();
  for (const transaction of transactions) {
    const definition = definitions.get(transaction.categoryId);
    const item = grouped.get(transaction.categoryId) ?? {
      id: transaction.categoryId,
      name: definition?.name ?? "Kategori",
      kind: definition?.kind ?? transaction.kind,
      count: 0,
      income: 0,
      grossExpense: 0,
      refunds: 0,
      netExpense: 0,
      netImpact: 0,
    };
    item.count += 1;
    if (transaction.kind === "income") item.income += transaction.amount;
    else if (transaction.refund) item.refunds += transaction.amount;
    else item.grossExpense += transaction.amount;
    grouped.set(transaction.categoryId, item);
  }
  return [...grouped.values()].map((item) => {
    item.netExpense = item.grossExpense - item.refunds;
    item.netImpact = item.income - item.netExpense;
    return item;
  });
}

function summarizeWallets(
  transactions: Transaction[],
  ledger: Ledger,
): WalletSummary[] {
  const definitions = new Map(
    ledger.wallets.map((item) => [item.id, item.name]),
  );
  const grouped = new Map<string, WalletSummary>();
  for (const transaction of transactions) {
    const item = grouped.get(transaction.walletId) ?? {
      id: transaction.walletId,
      name: definitions.get(transaction.walletId) ?? "Dompet",
      count: 0,
      income: 0,
      grossExpense: 0,
      refunds: 0,
      netExpense: 0,
      netImpact: 0,
    };
    item.count += 1;
    if (transaction.kind === "income") item.income += transaction.amount;
    else if (transaction.refund) item.refunds += transaction.amount;
    else item.grossExpense += transaction.amount;
    grouped.set(transaction.walletId, item);
  }
  return [...grouped.values()].map((item) => {
    item.netExpense = item.grossExpense - item.refunds;
    item.netImpact = item.income - item.netExpense;
    return item;
  });
}

function signedStyle(value: number, alternate: boolean) {
  if (value > 0) return alternate ? 23 : 22;
  if (value < 0) return alternate ? 25 : 24;
  return alternate ? 21 : 20;
}

function excelDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 0;
  const [, year, month, day] = match;
  return (
    Date.UTC(Number(year), Number(month) - 1, Number(day)) / 86_400_000 + 25_569
  );
}

function excelDateTime(value: Date) {
  const localTimeAsUtc = Date.UTC(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
  );
  return localTimeAsUtc / 86_400_000 + 25_569;
}

function cellAddress(row: number, column: number) {
  let letters = "";
  let current = column;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    current = Math.floor((current - 1) / 26);
  }
  return `${letters}${row}`;
}

function safeText(value: string) {
  return value.slice(0, 32_000);
}
