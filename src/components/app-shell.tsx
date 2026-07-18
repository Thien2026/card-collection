"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LOGO_SRC } from "@/lib/brand";
import {
  Boxes,
  CircleUserRound,
  FileStack,
  LayoutDashboard,
  ScrollText,
  Settings2,
  ChartColumn,
  House,
  Plus,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ThemeSwitcher } from "./theme-switcher";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  elevated?: boolean;
};

const userNavigation: NavItem[] = [
  { href: "/", label: "Trang chủ", icon: House },
  { href: "/bo-suu-tap", label: "Bộ sưu tập", icon: Boxes },
  { href: "/them-card", label: "Thêm mới", icon: Plus, elevated: true },
  { href: "/ban-hang", label: "Giao dịch", icon: Tag },
  { href: "/ho-so", label: "Hồ sơ", icon: CircleUserRound },
];

const adminNavigation: NavItem[] = [
  { href: "/admin", label: "Người dùng", icon: Users },
  { href: "/admin/file", label: "File", icon: FileStack },
  { href: "/admin/thong-ke", label: "Thống kê", icon: ChartColumn },
  { href: "/admin/he-thong", label: "Hệ thống", icon: Settings2 },
  { href: "/admin/nhat-ky", label: "Nhật ký", icon: ScrollText },
];

/** Mobile: giữ 4 mục admin + nút giữa Home về giao diện client. */
const adminMobileNavigation: NavItem[] = [
  { href: "/admin", label: "Người dùng", icon: Users },
  { href: "/admin/file", label: "File", icon: FileStack },
  { href: "/", label: "Trang chủ", icon: House, elevated: true },
  { href: "/admin/he-thong", label: "Hệ thống", icon: Settings2 },
  { href: "/admin/nhat-ky", label: "Nhật ký", icon: ScrollText },
];

export function AppShell({
  children,
  mode = "user",
  isAdmin = false,
}: {
  children: ReactNode;
  mode?: "user" | "admin";
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [canAccessAdmin, setCanAccessAdmin] = useState(isAdmin);
  const navigation = mode === "admin" ? adminNavigation : userNavigation;
  const mobileNavigation =
    mode === "admin" ? adminMobileNavigation : userNavigation;

  useEffect(() => {
    if (isAdmin) return;
    const controller = new AbortController();
    void fetch("/api/auth/session", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((session: { user?: { role?: string } } | null) => {
        if (session?.user?.role === "ADMIN") setCanAccessAdmin(true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [isAdmin]);

  return (
    <div className="min-h-screen bg-app-bg text-primary">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-app-border bg-surface px-5 py-7 text-primary lg:flex">
        <Link href="/" className="flex items-center gap-3 px-3">
          <span className="relative h-11 w-11 overflow-hidden rounded-2xl shadow-lg shadow-indigo-950/40">
            <Image
              src={LOGO_SRC}
              alt="Card Collection"
              fill
              sizes="44px"
              className="object-contain"
              priority
              unoptimized
            />
          </span>
          <span>
            <span className="block text-lg font-black tracking-tight">
              Card Collection
            </span>
            <span className="block text-xs font-semibold tracking-[0.16em] text-secondary">
              {mode === "admin" ? "ADMIN CONSOLE" : "COLLECTION MANAGER"}
            </span>
          </span>
        </Link>
        <nav className="mt-11 grid gap-2">
          {navigation.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}
          {canAccessAdmin && (
            <Link
              href={mode === "admin" ? "/" : "/admin"}
              className="mt-2 flex items-center gap-3 rounded-xl bg-accent-soft px-3 py-3 text-sm font-bold text-accent-text transition hover:bg-violet-500/20"
            >
              {mode === "admin" ? (
                <House size={20} />
              ) : (
                <LayoutDashboard size={20} />
              )}
              {mode === "admin" ? "Về trang người dùng" : "Quản trị"}
            </Link>
          )}
        </nav>
        <div className="mt-auto space-y-3">
          <ThemeSwitcher />
          <div className="rounded-2xl border border-app-border bg-accent-soft p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-accent-text">
              {mode === "admin" ? "Quản trị" : "Bộ sưu tập"}
            </p>
            <p className="mt-1 text-2xl font-black">
              Card Collection{" "}
              <span className="text-sm font-medium text-muted">v1</span>
            </p>
            {mode === "user" ? (
              <Link
                href="/them-card"
                className="mt-3 block text-xs font-bold text-accent-text"
              >
                + Thêm card mới
              </Link>
            ) : (
              <Link
                href="/"
                className="mt-3 block text-xs font-bold text-accent-text"
              >
                ← Quay lại ứng dụng
              </Link>
            )}
          </div>
        </div>
      </aside>
      <main className="min-h-screen pb-28 lg:ml-72 lg:pb-0">{children}</main>
      {pathname !== "/" && (
        <div className="fixed right-4 top-4 z-50 max-sm:hidden lg:hidden">
          <ThemeSwitcher compact />
        </div>
      )}
      <nav className="fixed inset-x-3 bottom-3 z-50 flex h-[72px] items-end justify-around rounded-[25px] border border-app-border bg-surface/95 px-1.5 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl shadow-black/40 backdrop-blur lg:hidden">
        {mobileNavigation.map((item) => (
          <NavLink
            key={`${item.href}-${item.label}`}
            item={item}
            active={isActive(pathname, item.href)}
            mobile
          />
        ))}
      </nav>
    </div>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  mobile = false,
}: {
  item: NavItem;
  active: boolean;
  mobile?: boolean;
}) {
  const elevated = Boolean(item.elevated);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={
        mobile
          ? `flex min-w-14 flex-1 flex-col items-center gap-1 px-1 text-[10px] font-bold ${
              elevated
                ? "-mt-8 text-accent-text"
                : active
                  ? "text-accent"
                  : "text-muted"
            }`
          : `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${active ? "bg-indigo-500 text-white shadow-lg shadow-indigo-950/30" : "text-secondary hover:bg-accent-soft hover:text-primary"}`
      }
    >
      <span
        className={
          mobile
            ? `grid place-items-center ${
                elevated
                  ? "h-14 w-14 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-xl shadow-violet-500/40"
                  : active
                    ? "h-8 w-8 rounded-lg bg-violet-500/15"
                    : "h-7 w-7"
              }`
            : "grid h-6 w-6 place-items-center"
        }
      >
        <Icon
          size={mobile && elevated ? 26 : mobile ? 19 : 20}
          strokeWidth={elevated ? 2.6 : 2.2}
        />
      </span>
      <span className={elevated && mobile ? "mt-0.5" : undefined}>
        {item.label}
      </span>
    </Link>
  );
}
