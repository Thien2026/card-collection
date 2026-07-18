import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const backupsRoot = path.join(process.cwd(), "backups");
const configPath = path.join(backupsRoot, "config.json");
const backupScript = path.join(process.cwd(), "deploy", "backup-card-collection.sh");
const restoreScript = path.join(process.cwd(), "deploy", "restore-card-collection.sh");

export type BackupConfig = {
  autoEnabled: boolean;
  keepCount: number;
  label: string;
};

export type BackupMeta = {
  id: string;
  createdAt: string;
  trigger: "manual" | "auto" | "upload" | string;
  databaseBytes: number;
  uploadsBytes: number;
  totalBytes: number;
};

const BACKUP_ID_RE = /^[0-9]{8}T[0-9]{6}Z$/;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

const defaultConfig: BackupConfig = {
  autoEnabled: true,
  keepCount: 14,
  label: "daily",
};

async function ensureBackupsDir() {
  await mkdir(backupsRoot, { recursive: true });
}

export async function getBackupConfig(): Promise<BackupConfig> {
  await ensureBackupsDir();
  try {
    const raw = await readFile(configPath, "utf8");
    return { ...defaultConfig, ...JSON.parse(raw) };
  } catch {
    await writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
}

export async function saveBackupConfig(
  patch: Partial<BackupConfig>,
): Promise<BackupConfig> {
  const current = await getBackupConfig();
  const next: BackupConfig = {
    autoEnabled:
      typeof patch.autoEnabled === "boolean"
        ? patch.autoEnabled
        : current.autoEnabled,
    keepCount:
      typeof patch.keepCount === "number" && patch.keepCount > 0
        ? Math.min(60, Math.floor(patch.keepCount))
        : current.keepCount,
    label: typeof patch.label === "string" ? patch.label : current.label,
  };
  await writeFile(configPath, JSON.stringify(next, null, 2));
  return next;
}

function runScript(script: string, args: string[] = []) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(script.endsWith(".sh") ? "bash" : script, script.endsWith(".sh") ? [script, ...args] : args, {
        cwd: process.cwd(),
        env: process.env,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
    },
  );
}

export async function listBackups(): Promise<BackupMeta[]> {
  await ensureBackupsDir();
  const names = await readdir(backupsRoot, { withFileTypes: true });
  const metas: BackupMeta[] = [];
  for (const entry of names) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await readFile(
        path.join(backupsRoot, entry.name, "meta.json"),
        "utf8",
      );
      metas.push(JSON.parse(raw) as BackupMeta);
    } catch {
      // skip incomplete folders
    }
  }
  return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createManualBackup() {
  await access(backupScript);
  const result = await runScript(backupScript, ["--force"]);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "Backup failed");
  }
  return result.stdout;
}

export async function restoreBackup(backupId: string) {
  if (!BACKUP_ID_RE.test(backupId)) {
    throw new Error("INVALID_BACKUP_ID");
  }
  await access(path.join(backupsRoot, backupId, "meta.json"));
  await access(restoreScript);
  const result = await runScript(restoreScript, [backupId]);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "Restore failed");
  }
  return result.stdout;
}

export async function deleteBackup(backupId: string) {
  if (!BACKUP_ID_RE.test(backupId)) {
    throw new Error("INVALID_BACKUP_ID");
  }
  const target = path.join(backupsRoot, backupId);
  await rm(target, { recursive: true, force: true });
}

export async function importUploadedBackupArchive(file: File) {
  if (!file || file.size <= 0) {
    throw new Error("EMPTY_FILE");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".tar.gz") && !name.endsWith(".tgz")) {
    throw new Error("INVALID_FILE_TYPE");
  }

  await ensureBackupsDir();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "cc-backup-upload-"));
  const archivePath = path.join(tempRoot, "upload.tar.gz");
  const extractPath = path.join(tempRoot, "extract");
  await mkdir(extractPath, { recursive: true });

  try {
    await writeFile(archivePath, Buffer.from(await file.arrayBuffer()));

    const extract = await runScript("tar", [
      "-xzf",
      archivePath,
      "-C",
      extractPath,
    ]);
    if (extract.code !== 0) {
      throw new Error(extract.stderr || "EXTRACT_FAILED");
    }

    const top = await readdir(extractPath, { withFileTypes: true });
    const dirs = top.filter((entry) => entry.isDirectory());
    if (dirs.length !== 1) {
      throw new Error("INVALID_ARCHIVE_STRUCTURE");
    }

    const backupId = dirs[0].name;
    if (!BACKUP_ID_RE.test(backupId)) {
      throw new Error("INVALID_BACKUP_ID");
    }

    const sourceDir = path.join(extractPath, backupId);
    await access(path.join(sourceDir, "database.dump"));
    await access(path.join(sourceDir, "uploads.tar.gz"));

    let meta: BackupMeta;
    try {
      meta = JSON.parse(
        await readFile(path.join(sourceDir, "meta.json"), "utf8"),
      ) as BackupMeta;
    } catch {
      const dbBytes = (await stat(path.join(sourceDir, "database.dump"))).size;
      const upBytes = (await stat(path.join(sourceDir, "uploads.tar.gz"))).size;
      meta = {
        id: backupId,
        createdAt: new Date().toISOString(),
        trigger: "upload",
        databaseBytes: dbBytes,
        uploadsBytes: upBytes,
        totalBytes: dbBytes + upBytes,
      };
    }

    meta = {
      ...meta,
      id: backupId,
      trigger: "upload",
      createdAt: meta.createdAt || new Date().toISOString(),
    };
    await writeFile(
      path.join(sourceDir, "meta.json"),
      JSON.stringify(meta, null, 2),
    );

    const destination = path.join(backupsRoot, backupId);
    await rm(destination, { recursive: true, force: true });
    await rename(sourceDir, destination);
    return meta;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
