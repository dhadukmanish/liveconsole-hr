import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Enough of a table engine for the four reports: a heading, column headers that
 * repeat on every page, zebra rows, and a totals line.
 *
 * Deliberately not a dependency. A report that has to print on A4 needs page
 * breaks and column widths, and that is about fifty lines — less than the
 * trouble of shipping a PDF table library into a payload that is uploaded over
 * FTP to shared hosting.
 */
const INK = rgb(0x2c / 255, 0x2c / 255, 0x2a / 255);
const MUTED = rgb(0x6b / 255, 0x6a / 255, 0x65 / 255);
const HAIRLINE = rgb(0xec / 255, 0xe7 / 255, 0xdf / 255);
const BRAND = rgb(0xf7 / 255, 0x94 / 255, 0x1d / 255);
const ZEBRA = rgb(0.98, 0.97, 0.95);

const A4 = { portrait: [595, 842] as const, landscape: [842, 595] as const };

export type Column = {
  header: string;
  /** Width in points. The caller owns the layout: these are printed reports. */
  width: number;
  align?: "left" | "right" | "center";
};

export type TableSpec = {
  title: string;
  subtitle?: string;
  orientation?: "portrait" | "landscape";
  columns: Column[];
  rows: string[][];
  /** Printed under the table, in bold. */
  totals?: string[];
  /** Shown when there are no rows, instead of an empty grid. */
  emptyText?: string;
  footer?: string;
};

type Fonts = { regular: PDFFont; bold: PDFFont };

const MARGIN = 32;
const ROW_HEIGHT = 18;
const HEADER_HEIGHT = 20;

/** pdf-lib throws on characters the font cannot draw, and WinAnsi has no ₹ or Devanagari. */
function safe(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, (char) => (char === "₹" ? "Rs." : "-"));
}

function fit(text: string, font: PDFFont, size: number, width: number): string {
  const clean = safe(text);
  if (font.widthOfTextAtSize(clean, size) <= width) return clean;
  let cut = clean;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > width) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

function drawRow(
  page: PDFPage,
  columns: Column[],
  cells: string[],
  y: number,
  font: PDFFont,
  size: number,
  colour = INK,
) {
  let x = MARGIN;
  columns.forEach((column, index) => {
    const raw = cells[index] ?? "";
    const text = fit(raw, font, size, column.width - 6);
    const textWidth = font.widthOfTextAtSize(text, size);
    const offset =
      column.align === "right"
        ? column.width - 4 - textWidth
        : column.align === "center"
          ? (column.width - textWidth) / 2
          : 4;
    page.drawText(text, { x: x + offset, y, size, font, color: colour });
    x += column.width;
  });
}

export async function buildReportPdf(spec: TableSpec): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(spec.title);
  pdf.setCreator("Live Console HR");

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const [width, height] = A4[spec.orientation ?? "portrait"];
  const tableWidth = spec.columns.reduce((sum, column) => sum + column.width, 0);

  let page = pdf.addPage([width, height]);
  let y = 0;

  const startPage = (first: boolean) => {
    if (!first) page = pdf.addPage([width, height]);
    y = height - MARGIN;

    if (first) {
      page.drawText(safe(spec.title), {
        x: MARGIN,
        y: y - 14,
        size: 15,
        font: fonts.bold,
        color: INK,
      });
      y -= 20;
      if (spec.subtitle) {
        page.drawText(safe(spec.subtitle), {
          x: MARGIN,
          y: y - 12,
          size: 9.5,
          font: fonts.regular,
          color: MUTED,
        });
        y -= 18;
      }
      page.drawRectangle({ x: MARGIN, y: y - 6, width: tableWidth, height: 2, color: BRAND });
      y -= 16;
    }

    // Column headers on every page: a register that runs to three pages is
    // unreadable if only the first one says what the columns are.
    drawRow(page, spec.columns, spec.columns.map((c) => c.header), y - 12, fonts.bold, 8.5);
    page.drawRectangle({
      x: MARGIN,
      y: y - HEADER_HEIGHT + 2,
      width: tableWidth,
      height: 0.8,
      color: HAIRLINE,
    });
    y -= HEADER_HEIGHT + 4;
  };

  startPage(true);

  if (spec.rows.length === 0) {
    page.drawText(safe(spec.emptyText ?? "Nothing to report"), {
      x: MARGIN,
      y: y - 12,
      size: 10,
      font: fonts.regular,
      color: MUTED,
    });
    y -= 20;
  }

  spec.rows.forEach((cells, index) => {
    if (y < MARGIN + ROW_HEIGHT * 2) startPage(false);
    if (index % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 4,
        width: tableWidth,
        height: ROW_HEIGHT,
        color: ZEBRA,
      });
    }
    drawRow(page, spec.columns, cells, y, fonts.regular, 8.5);
    y -= ROW_HEIGHT;
  });

  if (spec.totals) {
    if (y < MARGIN + ROW_HEIGHT * 2) startPage(false);
    page.drawRectangle({ x: MARGIN, y: y + 12, width: tableWidth, height: 0.8, color: HAIRLINE });
    drawRow(page, spec.columns, spec.totals, y - 2, fonts.bold, 8.5);
    y -= ROW_HEIGHT;
  }

  // Footers last, so every page can say which page it is out of how many.
  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    const label = `${spec.footer ? `${safe(spec.footer)}  ·  ` : ""}Page ${index + 1} of ${pages.length}`;
    current.drawText(label, {
      x: MARGIN,
      y: MARGIN - 12,
      size: 7.5,
      font: fonts.regular,
      color: MUTED,
    });
  });

  return pdf.save();
}
