import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ChartColumn,
  FileStack,
  ScrollText,
  Settings2,
} from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";

type AdminPlaceholderProps = {
  title: string;
  description: string;
  icon: LucideIcon;
};

async function requireAdmin() {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  if (session.user.role !== "ADMIN") redirect("/");
  return session;
}

export async function AdminPlaceholderPage({
  title,
  description,
  icon: Icon,
}: AdminPlaceholderProps) {
  await requireAdmin();

  return (
    <AppShell mode="admin" isAdmin>
      <div className="min-h-screen bg-app-bg px-5 py-8 text-primary lg:px-10">
        <div className="mx-auto max-w-3xl">
          <header className="mb-8">
            <p className="text-xs font-bold tracking-[0.18em] text-accent-text">
              QUẢN TRỊ HỆ THỐNG
            </p>
            <h1 className="mt-2 text-3xl font-black">{title}</h1>
            <p className="mt-2 text-sm text-muted">{description}</p>
          </header>
          <section className="rounded-2xl border border-dashed border-app-border bg-surface px-6 py-16 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
              <Icon size={28} />
            </span>
            <h2 className="mt-5 text-lg font-black">Sắp ra mắt</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              Tab này đã có trong menu admin. Nội dung sẽ bổ sung khi bạn chốt
              tính năng cụ thể.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

export const adminPlaceholderMeta = {
  file: {
    title: "File",
    description: "Quản lý file upload, dung lượng và dọn dẹp dữ liệu tạm.",
    icon: FileStack,
  },
  thongKe: {
    title: "Thống kê",
    description: "Tổng quan hệ thống — sẽ thay bằng báo cáo thật sau.",
    icon: ChartColumn,
  },
  heThong: {
    title: "Hệ thống",
    description: "Cấu hình hệ thống — tạm để chỗ, chưa chốt tính năng.",
    icon: Settings2,
  },
  nhatKy: {
    title: "Nhật ký",
    description: "Nhật ký hoạt động admin — tạm để chỗ, chưa chốt tính năng.",
    icon: ScrollText,
  },
} as const;
