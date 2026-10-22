export function applyCellStyles(xml: string, styles: Map<string, number>) {
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

export function addTabColor(xml: string, color: string) {
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

export function styleSheetView(xml: string, frozenRows?: number) {
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
