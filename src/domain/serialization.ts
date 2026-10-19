export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonical((value as Record<string, unknown>)[k]),
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function splitText(text: string, size = 500_000) {
  if (!Number.isInteger(size) || size < 2)
    throw new Error("Ukuran potongan tidak valid.");
  const chunks: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + size);
    const previous = text.charCodeAt(end - 1),
      next = text.charCodeAt(end);
    if (
      end < text.length &&
      previous >= 0xd800 &&
      previous <= 0xdbff &&
      next >= 0xdc00 &&
      next <= 0xdfff
    )
      end--;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
