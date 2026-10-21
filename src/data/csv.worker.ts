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
  if (
    range.s.r !== 0 ||
    range.s.c !== 0 ||
    range.e.c >= 100 ||
    range.e.r > MAX_ROWS
  )
    throw new Error(
      "Mulai dari sel A1; maksimal 100 kolom dan 100.000 baris data.",
    );
  const rows: string[][] = [];
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
    if (row === 0 || cells.some((value) => value.trim())) rows.push(cells);
  }
  if (rows.length < 2)
    throw new Error("File memerlukan judul kolom dan minimal satu baris data.");
  const headers = rows.shift()!.map((value) => value.trim());
  if (
    headers.some((value) => !value) ||
    new Set(headers).size !== headers.length
  )
    throw new Error("Judul kolom harus terisi dan berbeda.");
  return { headers, rows, delimiter: "" };
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
