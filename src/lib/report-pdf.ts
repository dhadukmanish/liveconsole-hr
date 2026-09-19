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

/**
 * The chart, in the same colours as the screen. Hard-coded light-mode hexes
 * rather than the CSS tokens: a PDF has no theme, and it is printed on white.
 */
const VIZ = [
  rgb(0x1d / 255, 0x9e / 255, 0x75 / 255),
  rgb(0xc8 / 255, 0x85 / 255, 0x0b / 255),
  rgb(0x2a / 255, 0x78 / 255, 0xd6 / 255),
  rgb(0xe8 / 255, 0x41 / 255, 0x2c / 255),
];
const VIZ_SEQ = rgb(0xc9 / 255, 0x6e / 255, 0x0a / 255);

export type ChartSpec = {
  shape: "stacked" | "columns";
  series: { label: string; slot: 1 | 2 | 3 | 4 | "seq" }[];
  rows: { label: string; values: number[] }[];
  max: number;
};

export type TableSpec = {
  title: string;
  subtitle?: string;
  orientation?: "portrait" | "landscape";
  /** Drawn above the table, when there is anything to plot. */
  chart?: ChartSpec;
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
    // A narrow column (a day in the register) gets almost no inset: with the
    // wide-column padding, "10" did not fit in 15pt and every two-digit day
    // header was truncated to "1...".
    const inset = column.width < 24 ? 1 : 6;
    const text = fit(raw, font, size, column.width - inset);
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

const fillFor = (slot: 1 | 2 | 3 | 4 | "seq") => (slot === "seq" ? VIZ_SEQ : VIZ[slot - 1]);

/**
 * The same bars as the screen, drawn with rectangles. Returns the new y.
 *
 * Deliberately the same geometry rules: a 2px gap in the page colour between
 * touching segments, one value label per bar rather than per segment, and a
 * legend only when there is more than one series.
 */
function drawChart(
  page: PDFPage,
  chart: ChartSpec,
  top: number,
  fonts: Fonts,
  tableWidth: number,
): number {
  const gap = 2;
  let y = top;

  if (chart.series.length > 1) {
    let x = MARGIN;
    for (const series of chart.series) {
      page.drawRectangle({ x, y: y - 7, width: 7, height: 7, color: fillFor(series.slot) });
      const label = safe(series.label);
      page.drawText(label, { x: x + 11, y: y - 7, size: 8, font: fonts.regular, color: MUTED });
      x += 11 + fonts.regular.widthOfTextAtSize(label, 8) + 14;
    }
    y -= 18;
  }

  if (chart.shape === "stacked") {
    const labelWidth = 110;
    const valueWidth = 30;
    const plotWidth = Math.max(120, tableWidth - labelWidth - valueWidth);
    const barHeight = 11;
    const rowGap = 6;
    const scale = plotWidth / chart.max;

    for (const row of chart.rows) {
      const total = row.values.reduce((sum, value) => sum + value, 0);
      let x = MARGIN + labelWidth;

      page.drawText(fit(row.label, fonts.regular, 8, labelWidth - 6), {
        x: MARGIN,
        y: y - barHeight + 3,
        size: 8,
        font: fonts.regular,
        color: INK,
      });

      row.values.forEach((value, index) => {
        if (value <= 0) return;
        const width = Math.max(value * scale, 1.5);
        page.drawRectangle({
          x,
          y: y - barHeight,
          width,
          height: barHeight,
          color: fillFor(chart.series[index].slot),
        });
        x += width + gap;
      });

      page.drawText(Number.isInteger(total) ? String(total) : total.toFixed(1), {
        x: x + 4,
        y: y - barHeight + 3,
        size: 8,
        font: fonts.regular,
        color: MUTED,
      });

      y -= barHeight + rowGap;
    }
  } else {
    const columnWidth = 16;
    const columnGap = 8;
    const plotHeight = 70;
    const scale = plotHeight / chart.max;
    const baseline = y - plotHeight - 12;

    page.drawRectangle({
      x: MARGIN,
      y: baseline,
      width: chart.rows.length * (columnWidth + columnGap),
      height: 0.8,
      color: HAIRLINE,
    });

    chart.rows.forEach((row, index) => {
      const value = row.values[0];
      const x = MARGIN + index * (columnWidth + columnGap);
      if (value > 0) {
        const height = Math.max(value * scale, 2);
        page.drawRectangle({
          x,
          y: baseline + 1,
          width: columnWidth,
          height,
          color: fillFor(chart.series[0].slot),
        });
        page.drawText(String(value), {
          x: x + columnWidth / 2 - 2,
          y: baseline + height + 4,
          size: 7,
          font: fonts.bold,
          color: INK,
        });
      }
      page.drawText(fit(row.label, fonts.regular, 6.5, columnWidth + columnGap), {
        x,
        y: baseline - 9,
        size: 6.5,
        font: fonts.regular,
        color: MUTED,
      });
    });

    y = baseline - 18;
  }

  return y - 8;
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

      // The chart belongs between the heading and the table, not above the
      // column headers — and the table carries on underneath it on the same
      // page, rather than leaving a mostly blank sheet behind.
      if (spec.chart && spec.chart.max > 0 && spec.chart.rows.length > 0) {
        y = drawChart(page, spec.chart, y, fonts, tableWidth);
      }
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
