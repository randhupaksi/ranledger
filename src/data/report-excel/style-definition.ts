export const colors = {
  forest: "234C3C",
  forestMid: "496653",
  leaf: "A8C39A",
  forestLight: "E3ECE0",
  mint: "F2F5EF",
  mintStrong: "DCE8D8",
  paper: "FFFFFF",
  stripe: "F7F8F4",
  ink: "243C30",
  muted: "6E786F",
  line: "D9E2D7",
  income: "316B4E",
  gold: "D6A84F",
  coral: "B83F4C",
  coralLight: "FBEAED",
  amber: "9A6509",
  amberLight: "FFF3D8",
  blue: "176B99",
  blueLight: "E4F2FA",
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
  { name: "Aptos", size: 8, bold: true, color: colors.income },
  { name: "Aptos Display", size: 18, bold: true, color: colors.income },
  { name: "Aptos", size: 8, bold: true, color: colors.coral },
  { name: "Aptos Display", size: 18, bold: true, color: colors.coral },
  { name: "Aptos", size: 8, bold: true, color: colors.amber },
  { name: "Aptos Display", size: 18, bold: true, color: colors.amber },
  { name: "Aptos", size: 8, bold: true, color: colors.blue },
  { name: "Aptos Display", size: 18, bold: true, color: colors.blue },
  { name: "Aptos", size: 9, bold: true, color: colors.paper },
  { name: "Aptos", size: 9, color: colors.muted },
  { name: "Aptos", size: 10, color: colors.income },
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
  { font: 5, fill: 5, border: 0 }, // 4: metadata label
  { font: 6, fill: 5, border: 0, wrap: true }, // 5: metadata value
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
    fill: 3,
    border: 2,
    horizontal: "center",
    wrap: true,
  }, // 17: table header
  { font: 0, fill: 10, border: 1, wrap: true }, // 18: table text
  { font: 0, fill: 11, border: 1, wrap: true }, // 19: alternate table text
  { font: 16, fill: 10, border: 1, horizontal: "right", numFmt: 164 }, // 20: table currency
  { font: 16, fill: 11, border: 1, horizontal: "right", numFmt: 164 }, // 21: alternate currency
  { font: 17, fill: 5, border: 1, horizontal: "right", numFmt: 164 }, // 22: positive flow
  { font: 17, fill: 5, border: 1, horizontal: "right", numFmt: 164 }, // 23: alternate positive flow
  { font: 18, fill: 7, border: 1, horizontal: "right", numFmt: 164 }, // 24: negative flow
  { font: 18, fill: 7, border: 1, horizontal: "right", numFmt: 164 }, // 25: alternate negative flow
  { font: 16, fill: 10, border: 1, numFmt: 165 }, // 26: table date
  { font: 16, fill: 11, border: 1, numFmt: 165 }, // 27: alternate date
  { font: 16, fill: 10, border: 1, horizontal: "right", numFmt: 3 }, // 28: table count
  { font: 16, fill: 11, border: 1, horizontal: "right", numFmt: 3 }, // 29: alternate count
  { font: 21, fill: 4, border: 2, wrap: true }, // 30: total / note
  { font: 20, fill: 4, border: 2, horizontal: "right", numFmt: 164 }, // 31: total currency
  { font: 16, fill: 10, border: 1, horizontal: "right" }, // 32: table numeric
  { font: 16, fill: 11, border: 1, horizontal: "right" }, // 33: alternate numeric
  { font: 16, fill: 10, border: 1, numFmt: 166 }, // 34: date and time
  { font: 17, fill: 5, border: 1, horizontal: "center" }, // 35: income type
  { font: 18, fill: 7, border: 1, horizontal: "center" }, // 36: expense type
  { font: 11, fill: 8, border: 1, horizontal: "center" }, // 37: refund type
  { font: 20, fill: 4, border: 2, horizontal: "right", numFmt: 3 }, // 38: total count
  { font: 1, fill: 2, border: 0, horizontal: "center" }, // 39: centered brand eyebrow
  { font: 2, fill: 2, border: 0, horizontal: "center" }, // 40: centered title
  { font: 3, fill: 3, border: 0, horizontal: "center", wrap: true }, // 41: centered subtitle
  { font: 6, fill: 5, border: 0, horizontal: "center", wrap: true }, // 42: centered metadata
  { font: 4, fill: 4, border: 2, horizontal: "center" }, // 43: centered section heading
  { font: 21, fill: 4, border: 2, horizontal: "center", wrap: true }, // 44: centered header instruction
  { font: 5, fill: 5, border: 0, horizontal: "center" }, // 45: centered metadata label
  { font: 16, fill: 10, border: 1, horizontal: "center", numFmt: 3 }, // 46: centered metadata count
  { font: 16, fill: 10, border: 1, horizontal: "center", numFmt: 166 }, // 47: centered export date
];

const currencyFormat = '"Rp" #,##0;[Red]-"Rp" #,##0;"Rp" 0';
const customNumberFormats = [
  { id: 164, format: currencyFormat },
  { id: 165, format: "dd mmm yyyy" },
  { id: 166, format: "dd mmm yyyy hh:mm" },
];

export function stylesXml() {
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
    `<border><left/><right/><top/><bottom style="thin"><color rgb="FF${colors.leaf}"/></bottom><diagonal/></border>`,
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
