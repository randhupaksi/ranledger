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

const colors = {
  forest: "183B2D",
  forestMid: "28523F",
  forestLight: "DCEBE0",
  mint: "EAF4EC",
  mintStrong: "CFE6D2",
  paper: "FFFFFF",
  stripe: "F5F8F5",
  ink: "26372F",
  muted: "64776B",
  line: "D7E2DA",
  sage: "85A98B",
  coral: "A9443C",
  coralLight: "F9E9E6",
  amber: "8C6A22",
  amberLight: "FAF2DB",
  blue: "426374",
  blueLight: "E8F0F3",
};

type Font = {
  name: string;
  size: number;
  bold?: boolean;
  color: string;
};
type Style = {
  font: number;
  fill: number;
  border: number;
  numFmt?: number;
  horizontal?: "left" | "center" | "right";
  wrap?: boolean;
  indent?: number;
};

const fonts: Font[] = [
  { name: "Aptos", size: 10, color: colors.ink },
  { name: "Aptos", size: 8, bold: true, color: colors.forestLight },
  { name: "Aptos Display", size: 22, bold: true, color: colors.paper },
  { name: "Aptos", size: 10, color: colors.forestLight },
  { name: "Aptos", size: 9, bold: true, color: colors.forest },
  { name: "Aptos", size: 8, bold: true, color: colors.muted },
  { name: "Aptos", size: 10, bold: true, color: colors.ink },
  { name: "Aptos", size: 8, bold: true, color: "286746" },
  { name: "Aptos Display", size: 18, bold: true, color: "286746" },
  { name: "Aptos", size: 8, bold: true, color: colors.coral },
  { name: "Aptos Display", size: 18, bold: true, color: colors.coral },
  { name: "Aptos", size: 8, bold: true, color: colors.amber },
  { name: "Aptos Display", size: 18, bold: true, color: colors.amber },
  { name: "Aptos", size: 8, bold: true, color: colors.blue },
  { name: "Aptos Display", size: 18, bold: true, color: colors.blue },
  { name: "Aptos", size: 9, bold: true, color: colors.paper },
  { name: "Aptos", size: 9, color: colors.muted },
  { name: "Aptos", size: 10, color: "286746" },
  { name: "Aptos", size: 10, color: colors.coral },
  { name: "Aptos", size: 10, color: colors.ink },
  { name: "Aptos", size: 10, bold: true, color: colors.ink },
  { name: "Aptos", size: 9, bold: true, color: colors.forest },
];

const fills = [
  "",
  "__gray125__",
  colors.forest,
  colors.forestMid,
  colors.forestLight,
  colors.mint,
  colors.mintStrong,
  colors.coralLight,
  colors.amberLight,
  colors.blueLight,
  colors.paper,
  colors.stripe,
];

const styles: Style[] = [
  { font: 0, fill: 0, border: 0 }, // 0: default
  { font: 1, fill: 2, border: 0, indent: 1 }, // 1: brand eyebrow
  { font: 2, fill: 2, border: 0, indent: 1 }, // 2: title
  { font: 3, fill: 3, border: 0, indent: 1, wrap: true }, // 3: subtitle
  { font: 5, fill: 10, border: 0 }, // 4: metadata label
  { font: 6, fill: 10, border: 0, wrap: true }, // 5: metadata value
  { font: 4, fill: 4, border: 2, indent: 1 }, // 6: section heading
  { font: 7, fill: 5, border: 3 }, // 7: income metric label
  { font: 8, fill: 5, border: 3, numFmt: 164 }, // 8: income metric value
  { font: 9, fill: 7, border: 3 }, // 9: expense metric label
  { font: 10, fill: 7, border: 3, numFmt: 164 }, // 10: expense metric value
  { font: 7, fill: 5, border: 3 }, // 11: positive net label
  { font: 8, fill: 5, border: 3, numFmt: 164 }, // 12: positive net value
  { font: 9, fill: 7, border: 3 }, // 13: negative net label
  { font: 10, fill: 7, border: 3, numFmt: 164 }, // 14: negative net value
  { font: 13, fill: 9, border: 3 }, // 15: count metric label
  { font: 14, fill: 9, border: 3, numFmt: 3 }, // 16: count metric value
  {
    font: 15,
    fill: 2,
    border: 2,
    horizontal: "center",
    wrap: true,
  }, // 17: table header
  { font: 0, fill: 10, border: 1, wrap: true }, // 18: table text
  { font: 0, fill: 11, border: 1, wrap: true }, // 19: alternate table text
  { font: 16, fill: 10, border: 1, horizontal: "right", numFmt: 164 }, // 20: table currency
  { font: 16, fill: 11, border: 1, horizontal: "right", numFmt: 164 }, // 21: alternate currency
  { font: 17, fill: 10, border: 1, horizontal: "right", numFmt: 164 }, // 22: positive flow
  { font: 17, fill: 11, border: 1, horizontal: "right", numFmt: 164 }, // 23: alternate positive flow
  { font: 18, fill: 10, border: 1, horizontal: "right", numFmt: 164 }, // 24: negative flow
  { font: 18, fill: 11, border: 1, horizontal: "right", numFmt: 164 }, // 25: alternate negative flow
  { font: 16, fill: 10, border: 1, numFmt: 165 }, // 26: table date
  { font: 16, fill: 11, border: 1, numFmt: 165 }, // 27: alternate date
  { font: 16, fill: 10, border: 1, horizontal: "right", numFmt: 3 }, // 28: table count
  { font: 16, fill: 11, border: 1, horizontal: "right", numFmt: 3 }, // 29: alternate count
  { font: 21, fill: 4, border: 2, wrap: true }, // 30: total / note
  { font: 20, fill: 4, border: 2, horizontal: "right", numFmt: 164 }, // 31: total currency
  { font: 16, fill: 10, border: 1, horizontal: "right" }, // 32: table numeric
  { font: 16, fill: 11, border: 1, horizontal: "right" }, // 33: alternate numeric
  { font: 16, fill: 10, border: 1, numFmt: 166 }, // 34: date and time
];

const currencyFormat = '"Rp" #,##0;[Red]-"Rp" #,##0;"Rp" 0';
const customNumberFormats = [
  { id: 164, format: currencyFormat },
  { id: 165, format: "dd mmm yyyy" },
  { id: 166, format: "dd mmm yyyy hh:mm" },
];

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
    tabColor: colors.forest,
    frozenRows: 1,
    autoFilter: "A1:E3",
  });
  ["tanggal", "jenis", "nominal", "kategori", "catatan"].forEach(
    (value, index) => sheet.set(1, index + 1, value, 17),
  );
  sheet.rowHeights.set(1, 30);
  const examples = [
    ["2026-01-01", "pengeluaran", 25000, "Makan & Minum", "Makan siang"],
    ["2026-01-02", "pemasukan", 1000000, "Gaji/Freelance", "Proyek"],
  ];
  examples.forEach((row, index) => {
    row.forEach((value, column) =>
      sheet.set(index + 2, column + 1, value, index % 2 ? 19 : 18),
    );
    sheet.rowHeights.set(index + 2, 25);
  });
  const guide = new SheetBuilder({
    name: "Panduan",
    widths: [25, 25, 25, 25, 25],
    tabColor: colors.sage,
  });
  guide.merged(1, 1, 5, "RANLEDGER  /  TEMPLATE IMPOR", 1);
  guide.merged(2, 1, 5, "Siapkan transaksi dengan mudah", 2);
  guide.merged(
    3,
    1,
    5,
    "Isi data di lembar Transaksi, lalu pilih file ini di Ranledger.",
    3,
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
    "Pertahankan nama kolom pada baris pertama lembar Transaksi.",
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
  sheet.merged(2, 1, 8, "RANLEDGER  /  LAPORAN KEUANGAN", 1);
  sheet.merged(3, 1, 8, "Laporan transaksi", 2);
  sheet.merged(4, 1, 8, safeText(rangeLabel), 3);
  sheet.set(5, 1, "DIEKSPOR", 4);
  sheet.merged(5, 2, 3, excelDateTime(generatedAt), 34);
  sheet.set(5, 4, "JUMLAH CATATAN", 4);
  sheet.set(5, 5, transactionCount, 28);
  sheet.set(5, 6, "MATA UANG", 4);
  sheet.merged(5, 7, 8, "IDR  /  Rupiah", 5);

  sheet.merged(7, 1, 8, "RINGKASAN PERIODE", 6);
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

  sheet.merged(11, 1, 8, "PENGELUARAN PER KATEGORI", 6);
  const categoryHeaders = [
    { start: 1, end: 4, label: "Kategori" },
    { start: 5, end: 6, label: "Jumlah catatan" },
    { start: 7, end: 8, label: "Pengeluaran bersih" },
  ];
  for (const header of categoryHeaders)
    sheet.merged(12, header.start, header.end, header.label, 17);
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
  sheet.merged(walletSectionRow, 1, 8, "ARUS TRANSAKSI PER DOMPET", 6);
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
    sheet.set(walletHeaderRow, index + 3, label, 17),
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
    tabColor: "5A8B68",
    frozenRows: 8,
    autoFilter: `A8:G${Math.max(8, transactions.length + 8)}`,
  });
  addDataSheetHeading(
    sheet,
    widths.length,
    "Daftar transaksi",
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
        ? "Refund pengeluaran"
        : transaction.kind === "income"
          ? "Pemasukan"
          : "Pengeluaran",
      alternate ? 19 : 18,
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
    tabColor: "B3944E",
    frozenRows: 8,
    autoFilter: `A8:H${Math.max(8, categories.length + 8)}`,
  });
  addDataSheetHeading(
    sheet,
    widths.length,
    "Ringkasan kategori",
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
  sheet.merged(1, 1, columnCount, "RANLEDGER  /  DATA LAPORAN", 1);
  sheet.merged(2, 1, columnCount, title, 2);
  sheet.merged(3, 1, columnCount, safeText(rangeLabel), 3);
  sheet.merged(
    4,
    1,
    columnCount,
    `Jumlah catatan: ${count.toLocaleString("id-ID")}`,
    5,
  );
  sheet.merged(6, 1, columnCount, "DATA TERPERINCI", 6);
  sheet.merged(7, 1, columnCount, safeText(note), 30);
  sheet.rowHeights.set(1, 18);
  sheet.rowHeights.set(2, 31);
  sheet.rowHeights.set(3, 24);
  sheet.rowHeights.set(7, 32);
  sheet.rowHeights.set(8, 30);
}

function addTableHeader(sheet: SheetBuilder, row: number, labels: string[]) {
  labels.forEach((label, index) => sheet.set(row, index + 1, label, 17));
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

function stylesXml() {
  const fontXml = fonts
    .map(
      (font) =>
        `<font><sz val="${font.size}"/><name val="${xmlEscape(font.name)}"/>${font.bold ? "<b/>" : ""}<color rgb="FF${font.color}"/></font>`,
    )
    .join("");
  const fillXml = fills
    .map((fill) => {
      if (!fill) return '<fill><patternFill patternType="none"/></fill>';
      if (fill === "__gray125__")
        return '<fill><patternFill patternType="gray125"/></fill>';
      return `<fill><patternFill patternType="solid"><fgColor rgb="FF${fill}"/><bgColor indexed="64"/></patternFill></fill>`;
    })
    .join("");
  const borderXml = [
    "<border><left/><right/><top/><bottom/><diagonal/></border>",
    `<border><left/><right/><top/><bottom style="hair"><color rgb="FF${colors.line}"/></bottom><diagonal/></border>`,
    `<border><left/><right/><top/><bottom style="thin"><color rgb="FF${colors.sage}"/></bottom><diagonal/></border>`,
    `<border><left style="thin"><color rgb="FF${colors.line}"/></left><right style="thin"><color rgb="FF${colors.line}"/></right><top style="thin"><color rgb="FF${colors.line}"/></top><bottom style="thin"><color rgb="FF${colors.line}"/></bottom><diagonal/></border>`,
  ].join("");
  const numberFormats = customNumberFormats
    .map(
      (item) =>
        `<numFmt numFmtId="${item.id}" formatCode="${xmlEscape(item.format)}"/>`,
    )
    .join("");
  const cellFormats = styles
    .map((style) => {
      const applyNumberFormat = style.numFmt ? ' applyNumberFormat="1"' : "";
      const alignmentParts = [
        style.horizontal ? `horizontal="${style.horizontal}"` : "",
        'vertical="center"',
        style.wrap ? 'wrapText="1"' : "",
        style.indent ? `indent="${style.indent}"` : "",
      ].filter(Boolean);
      const alignment = alignmentParts.length
        ? `<alignment ${alignmentParts.join(" ")}/>`
        : "";
      return `<xf numFmtId="${style.numFmt ?? 0}" fontId="${style.font}" fillId="${style.fill}" borderId="${style.border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1"${applyNumberFormat} applyAlignment="1">${alignment}</xf>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${customNumberFormats.length}">${numberFormats}</numFmts><fonts count="${fonts.length}">${fontXml}</fonts><fills count="${fills.length}">${fillXml}</fills><borders count="4">${borderXml}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${cellFormats}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleMedium9"/></styleSheet>`;
}

function applyCellStyles(xml: string, styles: Map<string, number>) {
  return xml.replace(
    /<c\b([^>]*?)(\/?)>/g,
    (tag, attributes: string, slash: string) => {
      const address = /\br="([^"]+)"/.exec(attributes)?.[1];
      const style = address ? styles.get(address) : undefined;
      if (!style) return tag;
      const withoutStyle = attributes.replace(/\s+s="[^"]*"/, "");
      return `<c${withoutStyle} s="${style}"${slash}>`;
    },
  );
}

function addTabColor(xml: string, color: string) {
  const tabColor = `<tabColor rgb="FF${color}"/>`;
  return xml
    .replace(
      /<sheetPr\b([^>]*?)(\/?)>/,
      (_tag, attributes: string, slash: string) => {
        const opening = `<sheetPr${attributes}>`;
        return slash
          ? `${opening}${tabColor}</sheetPr>`
          : `${opening}${tabColor}`;
      },
    )
    .replace(
      /(<worksheet\b[^>]*>)(?![\s\S]*<sheetPr\b)/,
      `$1<sheetPr>${tabColor}</sheetPr>`,
    );
}

function styleSheetView(xml: string, frozenRows?: number) {
  const firstVisibleRow = (frozenRows ?? 0) + 1;
  const pane = frozenRows
    ? `<pane ySplit="${frozenRows}" topLeftCell="A${firstVisibleRow}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${firstVisibleRow}" sqref="A${firstVisibleRow}"/>`
    : "";
  return xml.replace(
    /<sheetView\b([^>]*?)(\/?)>/,
    (_tag, attributes: string, slash: string) => {
      const normalized = attributes
        .replace(/\s+showGridLines="[^"]*"/, "")
        .replace(/\s+zoomScale="[^"]*"/, "");
      const opening = `<sheetView${normalized} showGridLines="0" zoomScale="90">`;
      return slash ? `${opening}${pane}</sheetView>` : `${opening}${pane}`;
    },
  );
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

function xmlEscape(value: string) {
  const xmlSafe = [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint === 0x9 ||
        codePoint === 0xa ||
        codePoint === 0xd ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      );
    })
    .join("");
  return xmlSafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
