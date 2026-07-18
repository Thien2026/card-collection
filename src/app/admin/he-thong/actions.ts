"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getAccountAccess } from "@/lib/account-access";
import {
  createManualBackup,
  deleteBackup,
  restoreBackup,
  saveBackupConfig,
} from "@/lib/system-backup";

export type SystemActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  if ((await getAccountAccess(session.user.id)) !== "ACTIVE") return null;
  return session;
}

export async function runManualBackupAction(
  _prev: SystemActionState,
  _formData: FormData,
): Promise<SystemActionState> {
  const session = await requireAdmin();
  if (!session) return { status: "error", message: "Không có quyền backup." };

  try {
    await createManualBackup();
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message.slice(0, 240)
          : "Backup thất bại.",
    };
  }

  revalidatePath("/admin/he-thong");
  return { status: "success", message: "Đã tạo backup thủ công." };
}

export async function restoreBackupAction(
  _prev: SystemActionState,
  formData: FormData,
): Promise<SystemActionState> {
  const session = await requireAdmin();
  if (!session) return { status: "error", message: "Không có quyền restore." };

  const backupId = String(formData.get("backupId") ?? "").trim();
  const confirm = String(formData.get("confirm") ?? "").trim();
  if (!backupId) return { status: "error", message: "Thiếu backup id." };
  if (confirm !== backupId) {
    return {
      status: "error",
      message: "Xác nhận không khớp. Gõ đúng mã backup để restore.",
    };
  }

  try {
    await restoreBackup(backupId);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message.slice(0, 240)
          : "Restore thất bại.",
    };
  }

  revalidatePath("/admin/he-thong");
  return {
    status: "success",
    message: `Đã restore từ ${backupId}. App đã được restart.`,
  };
}

export async function deleteBackupAction(
  _prev: SystemActionState,
  formData: FormData,
): Promise<SystemActionState> {
  const session = await requireAdmin();
  if (!session) return { status: "error", message: "Không có quyền xoá backup." };

  const backupId = String(formData.get("backupId") ?? "").trim();
  if (!backupId) return { status: "error", message: "Thiếu backup id." };

  try {
    await deleteBackup(backupId);
  } catch {
    return { status: "error", message: "Không thể xoá backup." };
  }

  revalidatePath("/admin/he-thong");
  return { status: "success", message: `Đã xoá backup ${backupId}.` };
}

export async function saveBackupConfigAction(
  _prev: SystemActionState,
  formData: FormData,
): Promise<SystemActionState> {
  const session = await requireAdmin();
  if (!session) {
    return { status: "error", message: "Không có quyền cập nhật cấu hình." };
  }

  const autoEnabled = formData.get("autoEnabled") === "on";
  const keepCount = Number(formData.get("keepCount") ?? 14);
  if (!Number.isFinite(keepCount) || keepCount < 1) {
    return { status: "error", message: "Số bản giữ lại không hợp lệ." };
  }

  await saveBackupConfig({ autoEnabled, keepCount });
  revalidatePath("/admin/he-thong");
  return {
    status: "success",
    message: autoEnabled
      ? `Đã bật auto backup · giữ ${keepCount} bản gần nhất.`
      : `Đã tắt auto backup · vẫn giữ ${keepCount} bản khi backup tay.`,
  };
}
