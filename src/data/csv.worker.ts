import { buildCsvPreview } from "./csv";
import type { CsvData, CsvMapping } from "./csv";
import { MAX_ROWS } from "../domain/ledger";
import type { Ledger } from "../domain/ledger";

type Request =
  | { type: "parse"; buffer: ArrayBuffer }
  | { type: "preview"; data: CsvData; mapping: CsvMapping; ledger: Ledger };
const scope = self as unknown as {
  onmessage: (event: MessageEvent<Request>) => void;
  postMessage: (data: unknown) => void;
};

async function parseWorkbook(buffer: ArrayBuffer): Promise<CsvData> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    cellNF: true,
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet["!ref"])
    throw new Error("Lembar pertama tidak berisi data.");
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  if (range.s.c !== 0 || range.e.c >= 100 || range.e.r > MAX_ROWS + 50)
    throw new Error(
      "Tabel harus dimulai dari kolom A; maksimal 100 kolom dan 100.000 baris data.",
    );
  const rows: { line: number; values: string[] }[] = [];
  for (let row = 0; row <= range.e.r; row++) {
    const cells: string[] = [];
    for (let column = 0; column <= range.e.c; column++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell?.f || cell?.F)
        throw new Error(
          "Rumus tidak didukung. Salin hasilnya sebagai nilai sebelum mengimpor.",
        );
      if (cell?.t === "e")
        throw new Error(
          "File mengandung sel dengan kesalahan. Perbaiki sebelum mengimpor.",
        );
      let value = cell?.v == null ? "" : String(cell.v);
      if (cell?.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)) {
        const date = XLSX.SSF.parse_date_code(cell.v as number, {
          date1904: Boolean(workbook.Workbook?.WBProps?.date1904),
        });
        if (!date) throw new Error("Tanggal Excel tidak valid.");
        value = `${String(date.y).padStart(4, "0")}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
      }
      if (value.length > 10000)
        throw new Error("Isi salah satu sel terlalu panjang.");
      cells.push(value);
    }
    if (cells.some((value) => value.trim()))
      rows.push({ line: row + 1, values: cells });
  }

  const findHeader = (cells: string[]) => {
    const headers = cells.map((value) => value.trim().toLowerCase());
    const has = (pattern: RegExp) =>
      headers.some((header) => pattern.test(header));
    const hasDate = has(/^(tanggal|date|transaction.?date)$/);
    const hasAmount = has(/^(nominal|amount|jumlah)$/);
    const hasDebit = has(/^(debit|debet)$/);
    const hasCredit = has(/^(credit|kredit)$/);
    return hasDate && (hasAmount || (hasDebit && hasCredit));
  };
  const detectedHeader = rows.findIndex(
    (row) => row.line <= 50 && findHeader(row.values),
  );
  const headerIndex =
    detectedHeader >= 0 ? detectedHeader : rows.findIndex(() => true);
  if (headerIndex < 0 || rows.length <= headerIndex + 1)
    throw new Error("File memerlukan judul kolom dan minimal satu baris data.");
  const headerRow = rows[headerIndex];
  const headers = headerRow.values.map((value) => value.trim());
  if (
    headers.some((value) => !value) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("Judul kolom harus terisi dan berbeda.");
  const dataRows = rows
    .slice(headerIndex + 1)
    .filter((row) => row.values.some((value) => value.trim()));
  if (dataRows.length > MAX_ROWS)
    throw new Error("File maksimal berisi 100.000 baris data.");
  return {
    headers,
    rows: dataRows.map((row) => row.values),
    delimiter: "",
    headerLine: headerRow.line,
  };
}

scope.onmessage = ({ data }) => {
  void (async () => {
    try {
      scope.postMessage({
        result:
          data.type === "parse"
            ? await parseWorkbook(data.buffer)
            : buildCsvPreview(data.data, data.mapping, data.ledger),
      });
    } catch (error) {
      scope.postMessage({
        error:
          error instanceof Error ? error.message : "File tidak dapat dibaca.",
      });
    }
  })();
};
