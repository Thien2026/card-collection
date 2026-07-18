"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { auth } from "@/auth";
import { getAccountAccess } from "@/lib/account-access";
import { prisma } from "@/lib/prisma";

export type AdminActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const ASSIGNABLE_ROLES = new Set<UserRole>([UserRole.USER, UserRole.ADMIN]);

function parseRole(value: FormDataEntryValue | null): UserRole | null {
  const role = String(value ?? "");
  return ASSIGNABLE_ROLES.has(role as UserRole) ? (role as UserRole) : null;
}

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return null;
  }
  const access = await getAccountAccess(session.user.id);
  if (access !== "ACTIVE") return null;
  return session;
}

export async function createUserAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const session = await requireAdminSession();
  if (!session) return { status: "error", message: "Không có quyền tạo user." };

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = parseRole(formData.get("role")) ?? UserRole.USER;

  if (!name || name.length < 2) {
    return { status: "error", message: "Tên hiển thị tối thiểu 2 ký tự." };
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return { status: "error", message: "Email không hợp lệ." };
  }
  if (password.length < 8) {
    return { status: "error", message: "Mật khẩu tối thiểu 8 ký tự." };
  }

  try {
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role,
        status: UserStatus.ACTIVE,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { status: "error", message: "Email này đã được sử dụng." };
    }
    return { status: "error", message: "Không thể tạo tài khoản." };
  }

  revalidatePath("/admin");
  return {
    status: "success",
    message: `Đã tạo tài khoản ${email} (${role === "ADMIN" ? "Admin" : "User"}).`,
  };
}

export async function updateUserRoleAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const session = await requireAdminSession();
  if (!session) {
    return { status: "error", message: "Không có quyền cập nhật role." };
  }

  const userId = String(formData.get("userId") ?? "").trim();
  const role = parseRole(formData.get("role"));
  if (!userId || !role) {
    return { status: "error", message: "Dữ liệu role không hợp lệ." };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, deletedAt: true },
  });
  if (!target) return { status: "error", message: "Không tìm thấy người dùng." };
  if (target.deletedAt) {
    return {
      status: "error",
      message: "Không thể đổi role tài khoản đã xoá. Hãy khôi phục trước.",
    };
  }

  if (target.role === role) {
    return { status: "idle", message: "" };
  }

  if (
    target.id === session.user.id &&
    target.role === UserRole.ADMIN &&
    role === UserRole.USER
  ) {
    const adminCount = await prisma.user.count({
      where: { role: UserRole.ADMIN, deletedAt: null },
    });
    if (adminCount <= 1) {
      return {
        status: "error",
        message: "Không thể hạ role admin cuối cùng của hệ thống.",
      };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  revalidatePath("/admin");
  return {
    status: "success",
    message: `Đã cập nhật ${target.email} → ${role === "ADMIN" ? "Admin" : "User"}.`,
  };
}

export async function suspendUserAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return setUserLifecycle(_prev, formData, "suspend");
}

export async function unsuspendUserAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return setUserLifecycle(_prev, formData, "unsuspend");
}

export async function softDeleteUserAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return setUserLifecycle(_prev, formData, "delete");
}

export async function restoreUserAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return setUserLifecycle(_prev, formData, "restore");
}

async function setUserLifecycle(
  _prev: AdminActionState,
  formData: FormData,
  action: "suspend" | "unsuspend" | "delete" | "restore",
): Promise<AdminActionState> {
  const session = await requireAdminSession();
  if (!session) {
    return { status: "error", message: "Không có quyền thực hiện thao tác." };
  }

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { status: "error", message: "Thiếu người dùng." };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!target) return { status: "error", message: "Không tìm thấy người dùng." };

  if (target.id === session.user.id) {
    return {
      status: "error",
      message: "Không thể đình chỉ hoặc xoá chính tài khoản đang đăng nhập.",
    };
  }

  if (action === "suspend") {
    if (target.deletedAt) {
      return { status: "error", message: "Tài khoản đã xoá, hãy khôi phục trước." };
    }
    if (target.status === UserStatus.SUSPENDED) {
      return { status: "idle", message: "" };
    }
    if (target.role === UserRole.ADMIN) {
      const adminCount = await prisma.user.count({
        where: {
          role: UserRole.ADMIN,
          deletedAt: null,
          status: UserStatus.ACTIVE,
        },
      });
      if (adminCount <= 1) {
        return {
          status: "error",
          message: "Không thể đình chỉ admin đang hoạt động cuối cùng.",
        };
      }
    }
    await prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.SUSPENDED },
    });
    revalidatePath("/admin");
    return {
      status: "success",
      message: `Đã đình chỉ ${target.email}.`,
    };
  }

  if (action === "unsuspend") {
    if (target.deletedAt) {
      return { status: "error", message: "Tài khoản đã xoá, hãy khôi phục trước." };
    }
    await prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });
    revalidatePath("/admin");
    return {
      status: "success",
      message: `Đã mở lại ${target.email}.`,
    };
  }

  if (action === "delete") {
    if (target.deletedAt) return { status: "idle", message: "" };
    if (target.role === UserRole.ADMIN) {
      const adminCount = await prisma.user.count({
        where: {
          role: UserRole.ADMIN,
          deletedAt: null,
        },
      });
      if (adminCount <= 1) {
        return {
          status: "error",
          message: "Không thể xoá admin cuối cùng của hệ thống.",
        };
      }
    }
    await prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        status: UserStatus.SUSPENDED,
      },
    });
    revalidatePath("/admin");
    return {
      status: "success",
      message: `Đã xoá mềm ${target.email}. Có thể khôi phục lại sau.`,
    };
  }

  // restore
  if (!target.deletedAt) {
    return { status: "idle", message: "" };
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: null,
      status: UserStatus.ACTIVE,
    },
  });
  revalidatePath("/admin");
  return {
    status: "success",
    message: `Đã khôi phục ${target.email}.`,
  };
}
