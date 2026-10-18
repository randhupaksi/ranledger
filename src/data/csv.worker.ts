import { parseCsv, buildCsvPreview } from "./csv";
import type { CsvData, CsvMapping } from "./csv";
import type { Ledger } from "../domain/ledger";
type Request =
  | { type: "parse"; text: string; delimiter?: string }
  | { type: "preview"; data: CsvData; mapping: CsvMapping; ledger: Ledger };
const scope = self as unknown as {
  onmessage: (event: MessageEvent<Request>) => void;
  postMessage: (data: unknown) => void;
};
scope.onmessage = ({ data }) => {
  try {
    scope.postMessage({
      result:
        data.type === "parse"
          ? parseCsv(data.text, data.delimiter)
          : buildCsvPreview(data.data, data.mapping, data.ledger),
    });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : "CSV tidak dapat dibaca.",
    });
  }
};
