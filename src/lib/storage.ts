import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** 10 MB, matching the requestLimits ceiling in web.config. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Map<string, string>([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

/**
 * Absolute upload root. Defaults to ./App_Data/uploads, which on the host sits
 * outside the web-servable path — uploaded documents are personal records and
 * must never be reachable by guessing a URL.
 */
export function uploadRoot(): string {
  const configured = process.env.UPLOAD_DIR ?? "./App_Data/uploads";
  return path.resolve(process.cwd(), configured);
}

/**
 * Resolves a stored relative path and refuses anything that escapes the upload
 * root, so a crafted database value cannot turn into an arbitrary file read.
 */
export function resolveStoredPath(storedPath: string): string {
  const root = uploadRoot();
  const resolved = path.resolve(root, storedPath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!resolved.startsWith(rootWithSep)) {
    throw new Error("Refusing to read outside the upload directory");
  }
  return resolved;
}

export type SavedFile = {
  storedPath: string;
  sizeBytes: number;
  mimeType: string;
  originalName: string;
};

export async function saveUpload(userId: string, file: File): Promise<SavedFile> {
  const extension = ALLOWED_MIME_TYPES.get(file.type);
  if (!extension) throw new Error("documents.badFileType");
  if (file.size === 0) throw new Error("errors.invalidInput");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("documents.fileTooLarge");

  // The stored name is generated: original names arrive from the client and can
  // contain path separators, null bytes or a second extension.
  const relative = path.posix.join(userId, `${randomUUID()}.${extension}`);
  const absolute = resolveStoredPath(relative);

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, Buffer.from(await file.arrayBuffer()), { mode: 0o640 });

  return {
    storedPath: relative,
    sizeBytes: file.size,
    mimeType: file.type,
    originalName: sanitiseDisplayName(file.name),
  };
}

/** Display-only: strips directories and control characters. */
export function sanitiseDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const withoutControls = Array.from(base)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 31 && code !== 127;
    })
    .join("");
  return withoutControls.slice(0, 160) || "file";
}

export async function readStoredFile(storedPath: string) {
  const absolute = resolveStoredPath(storedPath);
  const info = await stat(absolute);
  return { stream: createReadStream(absolute), size: info.size };
}

export async function deleteStoredFile(storedPath: string): Promise<void> {
  try {
    await unlink(resolveStoredPath(storedPath));
  } catch (error) {
    // A missing file must not block deleting its database row.
    console.warn("[storage] could not delete file", storedPath, error);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
