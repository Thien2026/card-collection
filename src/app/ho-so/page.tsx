import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  BarChart3,
  BookMarked,
  Boxes,
  CircleUserRound,
  Heart,
  History,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { formatVnd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { signOutAction } from "./actions";
import { ProfileSettings } from "./profile-settings";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/dang-nhap");

  const [
    user,
    availableCount,
    inventoryValue,
    collectionCount,
    completedSaleCount,
    categoryFavoriteCount,
    cardFavoriteCount,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.inventoryItem.count({
      where: { userId: session.user.id, status: "AVAILABLE" },
    }),
    prisma.inventoryItem.aggregate({
      where: { userId: session.user.id, status: "AVAILABLE" },
      _sum: { costPrice: true },
    }),
    prisma.category.count({
      where: {
        userId: session.user.id,
        parentId: null,
      },
    }),
    prisma.sale.count({
      where: {
        createdById: session.user.id,
        status: "COMPLETED",
      },
    }),
    prisma.categoryFavorite.count({ where: { userId: session.user.id } }),
    prisma.cardFavorite.count({ where: { userId: session.user.id } }),
  ]);
  if (!user) notFound();

  const favoriteCount = categoryFavoriteCount + cardFavoriteCount;
  const initial = user.name.trim().charAt(0).toUpperCase() || "C";

  return (
    <AppShell isAdmin={user.role === "ADMIN"}>
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-5 sm:px-6 lg:px-10 lg:py-10">
        <section className="relative overflow-hidden rounded-3xl border border-media-border bg-[radial-gradient(circle_at_90%_15%,rgba(139,92,246,0.32),transparent_35%),linear-gradient(135deg,#292467,#171742_58%,#10152e)] p-5 text-on-media sm:p-7">
          <Sparkles
            size={90}
            className="absolute -right-5 -top-5 text-white/5"
          />
          <div className="relative flex items-start gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 text-2xl font-black text-violet-200 shadow-xl">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-black sm:text-2xl">
                  {user.name}
                </h1>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[8px] font-black text-violet-200">
                  {user.role === "ADMIN" ? "QUẢN TRỊ VIÊN" : "THÀNH VIÊN"}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-on-media-muted">
                {user.email}
              </p>
              <p className="mt-2 text-[9px] text-on-media-muted">
                Tham gia từ {user.createdAt.toLocaleDateString("vi-VN")}
              </p>
            </div>
          </div>
          <div className="relative mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-4">
            <ProfileStat
              icon={<Boxes size={16} />}
              label="Đang sở hữu"
              value={`${availableCount} mục`}
            />
            <ProfileStat
              icon={<WalletCards size={16} />}
              label="Giá trị kho"
              value={formatVnd(inventoryValue._sum.costPrice ?? 0)}
            />
            <ProfileStat
              icon={<PackageCheck size={16} />}
              label="Bộ sưu tập"
              value={String(collectionCount)}
            />
            <ProfileStat
              icon={<BarChart3 size={16} />}
              label="Đơn hoàn tất"
              value={String(completedSaleCount)}
            />
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <QuickLink
            href="/yeu-thich"
            icon={<Heart size={18} />}
            label="Yêu thích"
            hint={`${favoriteCount} mục`}
          />
          <QuickLink
            href="/xem-gan-day"
            icon={<History size={18} />}
            label="Đã xem"
            hint="Xem gần đây"
          />
          <QuickLink
            href="/ban-hang/so-no"
            icon={<BookMarked size={18} />}
            label="Sổ nợ"
            hint="Quản lý công nợ"
          />
          <QuickLink
            href="/ban-hang/bao-cao"
            icon={<BarChart3 size={18} />}
            label="Báo cáo"
            hint="Doanh thu và lãi"
          />
        </section>

        <section className="mt-4 rounded-2xl border border-app-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
                <CircleUserRound size={19} />
              </span>
              <div>
                <p className="text-xs font-black text-primary">Giao diện</p>
                <p className="mt-0.5 text-[9px] text-muted">
                  Chọn chế độ sáng hoặc tối.
                </p>
              </div>
            </div>
            <ThemeSwitcher />
          </div>
        </section>

        <div className="mt-4">
          <ProfileSettings name={user.name} email={user.email} />
        </div>

        <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-app-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-primary">
              Phiên đăng nhập hiện tại
            </p>
            <p className="mt-1 text-[9px] text-muted">
              Đăng xuất khi bạn dùng xong trên thiết bị này.
            </p>
          </div>
          <div className="flex gap-2">
            {user.role === "ADMIN" && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-panel px-4 py-3 text-xs font-black text-secondary"
              >
                <LayoutDashboard size={15} />
                Quản trị
              </Link>
            )}
            <form action={signOutAction}>
              <button className="inline-flex items-center gap-2 rounded-xl bg-rose-500/12 px-4 py-3 text-xs font-black text-rose-500">
                <LogOut size={15} />
                Đăng xuất
              </button>
            </form>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function ProfileStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white/5 p-3">
      <span className="text-violet-300">{icon}</span>
      <p className="mt-2 text-[8px] text-on-media-muted">{label}</p>
      <p className="mt-1 truncate text-xs font-black text-on-media">{value}</p>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-app-border bg-surface p-3 transition hover:border-violet-400/50"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent-text">
        {icon}
      </span>
      <p className="mt-2 text-xs font-black text-primary">{label}</p>
      <p className="mt-0.5 text-[8px] text-muted">{hint}</p>
    </Link>
  );
}
