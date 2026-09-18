import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { readStoredFile } from "@/lib/storage";

/** Brand colours as pdf-lib expects them (0-1 floats). */
const BRAND = rgb(0xf7 / 255, 0x94 / 255, 0x1d / 255);
const INK = rgb(0x2c / 255, 0x2c / 255, 0x2a / 255);
const MUTED = rgb(0x6b / 255, 0x6a / 255, 0x65 / 255);
const HAIRLINE = rgb(0xec / 255, 0xe7 / 255, 0xdf / 255);

export type IdCardInput = {
  name: string;
  designation: string | null;
  department: string | null;
  employeeCode: string;
  mobile: string;
  organisation?: string;
  photoPath?: string | null;
  issuedOn?: Date;
};

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Renders a single credit-card-sized page (3.375in x 2.125in at 72dpi), which
 * prints correctly on standard ID stock instead of being an A4 page with a card
 * drawn in the corner.
 */
export async function buildIdCardPdf(input: IdCardInput): Promise<Uint8Array> {
  const width = 243;
  const height = 153;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`ID card — ${input.name}`);
  pdf.setCreator("Live Console HR");

  const page = pdf.addPage([width, height]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);

  // Header band
  page.drawRectangle({ x: 0, y: height - 26, width, height: 26, color: BRAND });
  page.drawText(input.organisation ?? "Live Console HR", {
    x: 10,
    y: height - 18,
    size: 10,
    font: bold,
    color: rgb(1, 1, 1),
  });

  // Photo, when the profile has one. A missing or unreadable photo must not
  // fail the whole card, so it falls back to an initials block.
  const photoBox = { x: 10, y: height - 100, width: 52, height: 62 };
  let photoDrawn = false;

  if (input.photoPath) {
    try {
      const file = await readStoredFile(input.photoPath);
      const bytes = await streamToBuffer(file.stream);
      const image = input.photoPath.endsWith(".png")
        ? await pdf.embedPng(bytes)
        : await pdf.embedJpg(bytes);
      page.drawImage(image, photoBox);
      photoDrawn = true;
    } catch (error) {
      console.warn("[id-card] could not embed photo", error);
    }
  }

  if (!photoDrawn) {
    page.drawRectangle({ ...photoBox, color: HAIRLINE });
    const letters = input.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
    page.drawText(letters, {
      x: photoBox.x + photoBox.width / 2 - letters.length * 7,
      y: photoBox.y + photoBox.height / 2 - 8,
      size: 22,
      font: bold,
      color: MUTED,
    });
  }

  const textX = photoBox.x + photoBox.width + 10;

  page.drawText(input.name.slice(0, 26), {
    x: textX,
    y: height - 48,
    size: 12,
    font: bold,
    color: INK,
  });

  if (input.designation) {
    page.drawText(input.designation.slice(0, 32), {
      x: textX,
      y: height - 62,
      size: 8,
      font: regular,
      color: MUTED,
    });
  }

  if (input.department) {
    page.drawText(input.department.slice(0, 32), {
      x: textX,
      y: height - 73,
      size: 8,
      font: regular,
      color: MUTED,
    });
  }

  page.drawText(`Emp code: ${input.employeeCode}`, {
    x: textX,
    y: height - 88,
    size: 8,
    font: bold,
    color: INK,
  });

  page.drawText(input.mobile, {
    x: textX,
    y: height - 99,
    size: 8,
    font: regular,
    color: MUTED,
  });

  // QR encodes the employee code, as specified — not a URL, so scanning it
  // cannot become a way into the app.
  const qrDataUrl = await QRCode.toDataURL(input.employeeCode, {
    margin: 0,
    width: 160,
    errorCorrectionLevel: "M",
  });
  const qrImage = await pdf.embedPng(
    Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"),
  );
  page.drawImage(qrImage, { x: width - 52, y: 10, width: 42, height: 42 });

  page.drawLine({
    start: { x: 10, y: 34 },
    end: { x: width - 58, y: 34 },
    thickness: 0.5,
    color: HAIRLINE,
  });

  const issued = (input.issuedOn ?? new Date()).toISOString().slice(0, 10);
  page.drawText(`Issued ${issued}`, {
    x: 10,
    y: 20,
    size: 7,
    font: regular,
    color: MUTED,
  });

  return pdf.save();
}
