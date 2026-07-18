import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAccountAccess } from "@/lib/account-access";
import { backupsRoot } from "@/lib/system-backup";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ backupId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return new NextResponse(null, { status: 403 });
  }
  if ((await getAccountAccess(session.user.id)) !== "ACTIVE") {
    return new NextResponse(null, { status: 403 });
  }

  const { backupId } = await params;
  if (!/^[0-9]{8}T[0-9]{6}Z$/.test(backupId)) {
    return NextResponse.json({ error: "Backup không hợp lệ." }, { status: 400 });
  }

  const backupDir = path.join(backupsRoot, backupId);
  try {
    await access(path.join(backupDir, "meta.json"));
  } catch {
    return NextResponse.json({ error: "Không tìm thấy backup." }, { status: 404 });
  }

  const tar = spawn(
    "tar",
    ["-czf", "-", "-C", backupsRoot, backupId],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      tar.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      tar.stderr.on("data", () => {
        // ignore progress noise
      });
      tar.on("error", (error) => {
        controller.error(error);
      });
      tar.on("close", (code) => {
        if (code === 0) controller.close();
        else controller.error(new Error(`tar exited with code ${code}`));
      });
    },
    cancel() {
      tar.kill("SIGTERM");
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="card-collection-backup-${backupId}.tar.gz"`,
      "Cache-Control": "no-store",
    },
  });
}
