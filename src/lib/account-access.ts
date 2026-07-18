import { UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AccountAccess = "ACTIVE" | "SUSPENDED" | "DELETED" | "MISSING";

export async function getAccountAccess(userId: string): Promise<AccountAccess> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, deletedAt: true },
  });
  if (!user) return "MISSING";
  if (user.deletedAt) return "DELETED";
  if (user.status === UserStatus.SUSPENDED) return "SUSPENDED";
  return "ACTIVE";
}

export function accountAccessMessage(access: AccountAccess) {
  if (access === "DELETED") {
    return "Tài khoản đã bị xoá. Liên hệ quản trị viên nếu đây là nhầm lẫn.";
  }
  if (access === "SUSPENDED") {
    return "Tài khoản đang bị đình chỉ. Liên hệ quản trị viên để được mở lại.";
  }
  if (access === "MISSING") {
    return "Tài khoản không còn tồn tại.";
  }
  return "";
}
