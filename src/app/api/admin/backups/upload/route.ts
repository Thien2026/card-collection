import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAccountAccess } from "@/lib/account-access";
import { importUploadedBackupArchive } from "@/lib/system-backup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Không có quyền." }, { status: 403 });
  }
  if ((await getAccountAccess(session.user.id)) !== "ACTIVE") {
    return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Vui lòng chọn file backup." }, { status: 400 });
  }

  try {
    const meta = await importUploadedBackupArchive(file);
    return NextResponse.json({
      ok: true,
      backupId: meta.id,
      message: `Đã tải lên backup ${meta.id}. Có thể Restore ngay.`,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message =
      code === "FILE_TOO_LARGE"
        ? "File quá lớn (tối đa 200MB)."
        : code === "INVALID_FILE_TYPE"
          ? "Chỉ nhận file .tar.gz backup đã tải về."
          : code === "INVALID_ARCHIVE_STRUCTURE" || code === "INVALID_BACKUP_ID"
            ? "File không đúng định dạng backup của hệ thống."
            : code === "EMPTY_FILE"
              ? "File trống."
              : "Không thể import backup.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
