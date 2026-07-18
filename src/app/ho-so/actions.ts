"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function updateProfile(
  _state: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "error", message: "Phiên đăng nhập đã hết hạn." };
  }
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 60) {
    return {
      status: "error",
      message: "Tên hiển thị phải có từ 2 đến 60 ký tự.",
    };
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { name },
  });
  revalidatePath("/ho-so");
  revalidatePath("/");
  return { status: "success", message: "Đã cập nhật tên hiển thị." };
}

export async function changePassword(
  _state: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "error", message: "Phiên đăng nhập đã hết hạn." };
  }
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (newPassword.length < 8) {
    return {
      status: "error",
      message: "Mật khẩu mới phải có ít nhất 8 ký tự.",
    };
  }
  if (newPassword !== confirmPassword) {
    return { status: "error", message: "Mật khẩu xác nhận không khớp." };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { status: "error", message: "Mật khẩu hiện tại không đúng." };
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return {
      status: "error",
      message: "Mật khẩu mới phải khác mật khẩu hiện tại.",
    };
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });
  return { status: "success", message: "Đã đổi mật khẩu thành công." };
}

export async function signOutAction() {
  await signOut({ redirectTo: "/dang-nhap" });
}
