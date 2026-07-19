import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export const uploadsRoot = process.env.UPLOADS_ROOT ?? path.join(process.cwd(), "uploads");
export const usersUploadsRoot = path.join(uploadsRoot, "users");

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export type FolderUsage = {
  name: string;
  bytes: number;
  files: number;
  folders: number;
};

export type UserStorageSummary = {
  userId: string;
  bytes: number;
  files: number;
  folders: FolderUsage[];
};

export type StorageEntry = {
  name: string;
  relativePath: string;
  kind: "file" | "directory";
  bytes: number;
  files: number;
  updatedAt: string | null;
};

export function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function assertSafeUserId(userId: string) {
  if (!SAFE_SEGMENT.test(userId)) {
    throw new Error("INVALID_USER_ID");
  }
}

export function resolveUserRelativePath(userId: string, relativePath = "") {
  assertSafeUserId(userId);
  const parts = relativePath
    .split(/[\\/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.some((part) => part === "." || part === ".." || !SAFE_SEGMENT.test(part))) {
    throw new Error("INVALID_PATH");
  }
  const absolute = path.resolve(usersUploadsRoot, userId, ...parts);
  const root = path.resolve(usersUploadsRoot, userId);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error("INVALID_PATH");
  }
  return { absolute, parts, relativePath: parts.join("/") };
}

async function walkDirectory(absolutePath: string): Promise<{
  bytes: number;
  files: number;
  folders: number;
}> {
  let bytes = 0;
  let files = 0;
  let folders = 0;
  let entries;
  try {
    entries = await readdir(absolutePath, { withFileTypes: true });
  } catch {
    return { bytes: 0, files: 0, folders: 0 };
  }

  for (const entry of entries) {
    const child = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) {
      folders += 1;
      const nested = await walkDirectory(child);
      bytes += nested.bytes;
      files += nested.files;
      folders += nested.folders;
    } else if (entry.isFile()) {
      files += 1;
      try {
        bytes += (await stat(child)).size;
      } catch {
        // ignore unreadable files
      }
    }
  }

  return { bytes, files, folders };
}

export async function getUserStorageSummary(
  userId: string,
): Promise<UserStorageSummary> {
  assertSafeUserId(userId);
  const userRoot = path.join(usersUploadsRoot, userId);
  let entries;
  try {
    entries = await readdir(userRoot, { withFileTypes: true });
  } catch {
    return { userId, bytes: 0, files: 0, folders: [] };
  }

  const folders: FolderUsage[] = [];
  let bytes = 0;
  let files = 0;

  for (const entry of entries) {
    const child = path.join(userRoot, entry.name);
    if (entry.isDirectory()) {
      const usage = await walkDirectory(child);
      folders.push({
        name: entry.name,
        bytes: usage.bytes,
        files: usage.files,
        folders: usage.folders,
      });
      bytes += usage.bytes;
      files += usage.files;
    } else if (entry.isFile()) {
      files += 1;
      try {
        const size = (await stat(child)).size;
        bytes += size;
        folders.push({
          name: entry.name,
          bytes: size,
          files: 1,
          folders: 0,
        });
      } catch {
        // ignore
      }
    }
  }

  folders.sort((a, b) => b.bytes - a.bytes);
  return { userId, bytes, files, folders };
}

export async function listStorageEntries(
  userId: string,
  relativePath = "",
): Promise<StorageEntry[]> {
  const { absolute, relativePath: normalized } = resolveUserRelativePath(
    userId,
    relativePath,
  );
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    return [];
  }

  const result: StorageEntry[] = [];
  for (const entry of entries) {
    const child = path.join(absolute, entry.name);
    const childRelative = normalized
      ? `${normalized}/${entry.name}`
      : entry.name;
    if (entry.isDirectory()) {
      const usage = await walkDirectory(child);
      let updatedAt: string | null = null;
      try {
        updatedAt = (await stat(child)).mtime.toISOString();
      } catch {
        updatedAt = null;
      }
      result.push({
        name: entry.name,
        relativePath: childRelative,
        kind: "directory",
        bytes: usage.bytes,
        files: usage.files,
        updatedAt,
      });
    } else if (entry.isFile()) {
      try {
        const info = await stat(child);
        result.push({
          name: entry.name,
          relativePath: childRelative,
          kind: "file",
          bytes: info.size,
          files: 1,
          updatedAt: info.mtime.toISOString(),
        });
      } catch {
        // ignore
      }
    }
  }

  return result.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function deleteStoragePath(userId: string, relativePath: string) {
  const { absolute, parts } = resolveUserRelativePath(userId, relativePath);
  if (!parts.length) {
    throw new Error("CANNOT_DELETE_ROOT");
  }
  await rm(absolute, { recursive: true, force: true });
}

export async function clearUserTmp(userId: string) {
  assertSafeUserId(userId);
  const tmpPath = path.join(usersUploadsRoot, userId, "tmp");
  await rm(tmpPath, { recursive: true, force: true });
}
