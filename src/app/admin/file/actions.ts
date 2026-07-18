"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getAccountAccess } from "@/lib/account-access";
import {
  clearUserTmp,
  deleteStoragePath,
} from "@/lib/upload-usage";

export type FileActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  const access = await getAccountAccess(session.user.id);
  if (access !== "ACTIVE") return null;
  return session;
}

export async function deleteUploadPathAction(
  _prev: FileActionState,
  formData: FormData,
): Promise<FileActionState> {
  const session = await requireAdmin();
  if (!session) return { status: "error", message: "Không có quyền xoá file." };

  const userId = String(formData.get("userId") ?? "").trim();
  const relativePath = String(formData.get("relativePath") ?? "").trim();
  if (!userId || !relativePath) {
    return { status: "error", message: "Thiếu đường dẫn cần xoá." };
  }

  try {
    await deleteStoragePath(userId, relativePath);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CANNOT_DELETE_ROOT") {
      return { status: "error", message: "Không thể xoá thư mục gốc của user." };
    }
    if (code === "INVALID_PATH" || code === "INVALID_USER_ID") {
      return { status: "error", message: "Đường dẫn không hợp lệ." };
    }
    return { status: "error", message: "Không thể xoá mục đã chọn." };
  }

  revalidatePath("/admin/file");
  revalidatePath(`/admin/file/${userId}`);
  return {
    status: "success",
    message: `Đã xoá ${relativePath}.`,
  };
}

export async function clearUserTmpAction(
  _prev: FileActionState,
  formData: FormData,
): Promise<FileActionState> {
  const session = await requireAdmin();
  if (!session) {
    return { status: "error", message: "Không có quyền dọn file tạm." };
  }

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { status: "error", message: "Thiếu user." };

  try {
    await clearUserTmp(userId);
  } catch {
    return { status: "error", message: "Không thể dọn thư mục tmp." };
  }

  revalidatePath("/admin/file");
  revalidatePath(`/admin/file/${userId}`);
  return {
    status: "success",
    message: "Đã xoá toàn bộ file tạm (tmp).",
  };
}
