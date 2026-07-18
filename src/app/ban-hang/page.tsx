import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookMarked,
  ChevronDown,
  ClipboardList,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { Pagination } from "@/components/pagination";
import { formatVnd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  isSalesChannel,
  salesChannelLabel,
  salesChannels,
} from "@/lib/sales-channels";
import { OrdersPanel, type OrderRow } from "./orders-panel";
import { ScrollToSectionButton } from "./scroll-to-section-button";

const statuses = ["ALL", "DRAFT", "COMPLETED", "CANCELLED", "REFUNDED"] as const;
type StatusFilter = (typeof statuses)[number];
const PAGE_SIZE = 12;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
    channel?: string;
    customerId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/dang-nhap");

  const params = await searchParams;
  const status: StatusFilter = statuses.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : "ALL";
  const query = params.q?.trim() ?? "";
  const channel =
    params.channel && isSalesChannel(params.channel) ? params.channel : "";
  const customerId = params.customerId?.trim() ?? "";
  const from = parseDateInput(params.from);
  const to = parseDateInput(params.to);
  const requestedPage = positiveInt(params.page);

  const customers = await prisma.customer.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  const customerValid =
    !customerId || customers.some((customer) => customer.id === customerId);

  const dateRange =
    from || to
      ? {
          createdAt: {
            ...(from ? { gte: startOfDay(from) } : {}),
            ...(to ? { lte: endOfDay(to) } : {}),
          },
        }
      : {};

  const where: Prisma.SaleWhereInput = {
    createdById: session.user.id,
    ...(status === "ALL" ? {} : { status }),
    ...(channel ? { salesChannel: channel } : {}),
    ...(customerValid && customerId ? { customerId } : {}),
    ...dateRange,
    ...(query
      ? {
          OR: [
            { code: { contains: query, mode: "insensitive" } },
            { customerName: { contains: query, mode: "insensitive" } },
            { salesChannel: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const completedWhere: Prisma.SaleWhereInput = {
    createdById: session.user.id,
    status: "COMPLETED",
  };

  const [matchingCount, totalOrderCount, itemTotals, expenseTotals, refundTotals] =
    await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.count({ where: { createdById: session.user.id } }),
      prisma.saleItem.aggregate({
        where: {
          refundedAt: null,
          sale: completedWhere,
        },
        _sum: { soldPrice: true, costPrice: true },
        _count: true,
      }),
      prisma.saleExpense.aggregate({
        where: { sale: completedWhere },
        _sum: { amount: true },
      }),
      prisma.saleItem.aggregate({
        where: {
          refundedAt: { not: null },
          sale: { createdById: session.user.id, status: { in: ["COMPLETED", "REFUNDED"] } },
        },
        _sum: { soldPrice: true },
        _count: true,
      }),
    ]);
  const totalPages = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const sales = await prisma.sale.findMany({
    where,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      items: {
        include: {
          inventoryItem: {
            include: {
              card: {
                select: { id: true, name: true, referenceImage: true },
              },
            },
          },
        },
      },
      expenses: { select: { amount: true } },
      payments: { select: { amount: true, direction: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const revenue = itemTotals._sum.soldPrice ?? 0;
  const capital = itemTotals._sum.costPrice ?? 0;
  const expenses = expenseTotals._sum.amount ?? 0;
  const profit = revenue - capital - expenses;
  const soldItems = itemTotals._count;
  const refundedValue = refundTotals._sum.soldPrice ?? 0;

  const orderRows: OrderRow[] = sales.map((sale) => {
    const activeItems = sale.items.filter((item) => !item.refundedAt);
    const refundedCount = sale.items.length - activeItems.length;
    const saleRevenue = activeItems.reduce(
      (sum, item) => sum + item.soldPrice,
      0,
    );
    const saleCapital = activeItems.reduce(
      (sum, item) => sum + item.costPrice,
      0,
    );
    const saleExpenses = sale.expenses.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    const paid = sale.payments.reduce(
      (sum, payment) =>
        sum +
        (payment.direction === "CUSTOMER_TO_US"
          ? payment.amount
          : -payment.amount),
      0,
    );
    const date =
      sale.refundedAt ??
      sale.completedAt ??
      sale.cancelledAt ??
      sale.updatedAt;
    return {
      id: sale.id,
      code: sale.code,
      status: sale.status,
      partiallyRefunded: sale.status === "COMPLETED" && refundedCount > 0,
      customerName: sale.customerName,
      salesChannel: sale.salesChannel,
      revenue: saleRevenue,
      paid,
      profit: saleRevenue - saleCapital - saleExpenses,
      itemsCount: activeItems.length,
      dateLabel: date.toLocaleDateString("vi-VN"),
      previewImage:
        activeItems[0]?.inventoryItem.card.referenceImage ??
        activeItems[0]?.inventoryItem.imageUrl ??
        sale.items[0]?.inventoryItem.card.referenceImage ??
        sale.items[0]?.inventoryItem.imageUrl ??
        null,
    };
  });

  const filterState = {
    status,
    q: query,
    channel,
    customerId: customerValid ? customerId : "",
    from: from ?? "",
    to: to ?? "",
  };
  const hasActiveFilters = Boolean(
    query || channel || (customerValid && customerId) || from || to,
  );
  const activeFilterCount = [
    query,
    channel,
    customerValid && customerId ? customerId : "",
    from,
    to,
  ].filter(Boolean).length;

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6 lg:px-10 lg:py-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-accent-text">
              Bán hàng
            </p>
            <h1 className="mt-1 text-2xl font-black text-primary sm:text-3xl">
              Giao dịch
            </h1>
            <p className="mt-1 text-xs text-muted">
              Theo dõi doanh thu, chi phí và lợi nhuận đã chốt.
            </p>
          </div>
          <Link
            href="/ban-hang/tao-moi"
            className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-violet-950/25 sm:text-sm"
          >
            <Plus size={17} />
            <span className="hidden sm:inline">Giao dịch mới</span>
            <span className="sm:hidden">Tạo mới</span>
          </Link>
        </header>

        <section className="mt-6 overflow-hidden rounded-3xl border border-app-border bg-surface">
          <div className="relative overflow-hidden bg-[radial-gradient(circle_at_90%_10%,rgba(139,92,246,0.28),transparent_35%),linear-gradient(135deg,#292467,#171742_58%,#10152e)] p-5 text-on-media sm:p-6">
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-media-muted">
                  Lợi nhuận đã chốt
                </p>
                <p
                  className={`mt-2 text-3xl font-black sm:text-4xl ${
                    profit < 0 ? "text-rose-300" : "text-emerald-300"
                  }`}
                >
                  {signedVnd(profit)}
                </p>
                <p className="mt-2 text-[10px] text-on-media-muted">
                  Doanh thu trừ giá vốn và mọi chi phí đơn hàng
                </p>
              </div>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-media-border bg-white/10">
                {profit >= 0 ? (
                  <ArrowUpRight className="text-emerald-300" />
                ) : (
                  <ArrowDownRight className="text-rose-300" />
                )}
              </span>
            </div>
            <div className="relative z-10 mt-6 grid grid-cols-2 gap-2 border-t border-media-border pt-4 sm:grid-cols-4">
              <HeroMetric label="Doanh thu" value={formatVnd(revenue)} />
              <HeroMetric label="Chi phí" value={formatVnd(expenses)} />
              <HeroMetric label="Đã bán" value={`${soldItems} mục`} />
              <HeroMetric label="Đã hoàn" value={formatVnd(refundedValue)} />
            </div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ActionLink
            href="/ban-hang/khach-hang"
            icon={<UserRound size={18} />}
            label="Khách hàng"
            hint="Quản lý khách"
          />
          <ScrollToSectionButton
            targetId="don-hang"
            icon={<ClipboardList size={18} />}
            label="Đơn hàng"
            hint={`${totalOrderCount} đơn`}
          />
          <ActionLink
            href="/ban-hang/bao-cao"
            icon={<BarChart3 size={18} />}
            label="Báo cáo"
            hint="Doanh thu · lãi"
          />
          <ActionLink
            href="/ban-hang/so-no"
            icon={<BookMarked size={18} />}
            label="Sổ nợ"
            hint="Công nợ"
          />
        </section>

        <section id="don-hang" className="mt-7 scroll-mt-24 lg:scroll-mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-black text-primary">Đơn hàng</h2>
              <p className="mt-1 text-[10px] text-muted">
                {matchingCount} giao dịch phù hợp
              </p>
            </div>
          </div>

          <details
            className="group mt-4 rounded-2xl border border-app-border bg-surface"
            open={hasActiveFilters ? true : undefined}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-black text-primary [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal size={15} className="text-accent-text" />
              <span className="flex-1">Bộ lọc</span>
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-accent-soft px-2 py-1 text-[8px] text-accent-text">
                  {activeFilterCount} đang dùng
                </span>
              )}
              <ChevronDown
                size={15}
                className="text-muted transition group-open:rotate-180"
              />
            </summary>
            <form className="grid gap-2 border-t border-app-border p-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto]">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Mã đơn, khách hàng..."
                  className="w-full rounded-xl border border-app-border bg-panel py-2.5 pl-9 pr-3 text-xs text-primary outline-none placeholder:text-muted focus:border-violet-400"
                />
              </div>
              <select
                name="channel"
                defaultValue={channel}
                className="rounded-xl border border-app-border bg-panel px-3 py-2.5 text-xs text-primary outline-none focus:border-violet-400"
              >
                <option value="">Tất cả kênh</option>
                {salesChannels.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                name="customerId"
                defaultValue={customerValid ? customerId : ""}
                className="rounded-xl border border-app-border bg-panel px-3 py-2.5 text-xs text-primary outline-none focus:border-violet-400"
              >
                <option value="">Tất cả khách</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
              <label className="block">
                <span className="mb-1 block text-[9px] font-bold text-muted">
                  Từ ngày
                </span>
                <input
                  type="date"
                  name="from"
                  defaultValue={from ?? ""}
                  className="w-full rounded-xl border border-app-border bg-panel px-3 py-2 text-xs text-primary outline-none focus:border-violet-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[9px] font-bold text-muted">
                  Đến ngày
                </span>
                <input
                  type="date"
                  name="to"
                  defaultValue={to ?? ""}
                  className="w-full rounded-xl border border-app-border bg-panel px-3 py-2 text-xs text-primary outline-none focus:border-violet-400"
                />
              </label>
              {status !== "ALL" && (
                <input type="hidden" name="status" value={status} />
              )}
              <button
                type="submit"
                className="self-end rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white"
              >
                Lọc
              </button>
            </form>
          </details>

          {hasActiveFilters && (
            <p className="mt-2 text-[10px] text-muted">
              Đang lọc
              {query ? ` · “${query}”` : ""}
              {channel ? ` · kênh ${salesChannelLabel(channel)}` : ""}
              {customerValid && customerId
                ? ` · khách ${
                    customers.find((customer) => customer.id === customerId)
                      ?.name ?? ""
                  }`
                : ""}
              {from || to
                ? ` · ngày ${from ? formatDateVi(from) : "…"} → ${to ? formatDateVi(to) : "…"}`
                : ""}
              {" · "}
              <Link
                href={filterHref({
                  ...filterState,
                  q: "",
                  channel: "",
                  customerId: "",
                  from: "",
                  to: "",
                })}
                className="font-bold text-accent-text"
              >
                Xoá lọc
              </Link>
            </p>
          )}

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {statuses.map((value) => (
              <Link
                key={value}
                href={filterHref({ ...filterState, status: value })}
                className={`shrink-0 rounded-full px-3.5 py-2 text-[10px] font-black transition ${
                  status === value
                    ? "bg-accent text-white"
                    : "border border-app-border bg-surface text-secondary"
                }`}
              >
                {
                  {
                    ALL: "Tất cả",
                    DRAFT: "Đơn nháp",
                    COMPLETED: "Hoàn tất",
                    CANCELLED: "Đã huỷ",
                    REFUNDED: "Đã hoàn",
                  }[value]
                }
              </Link>
            ))}
          </div>

          <div className="mt-3">
            {orderRows.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-app-border-strong bg-surface p-10 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
                  <ShoppingBag size={25} />
                </span>
                <h3 className="mt-4 text-sm font-black text-primary">
                  Chưa có giao dịch
                </h3>
                <p className="mt-1 text-xs text-muted">
                  Bắt đầu bằng cách tạo giao dịch mới từ kho.
                </p>
                <Link
                  href="/ban-hang/tao-moi"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-xs font-black text-white"
                >
                  <Plus size={15} />
                  Tạo giao dịch
                </Link>
              </div>
            ) : (
              <OrdersPanel sales={orderRows} />
            )}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/ban-hang"
            params={{
              status: status === "ALL" ? undefined : status,
              q: query || undefined,
              channel: channel || undefined,
              customerId: customerValid && customerId ? customerId : undefined,
              from: from || undefined,
              to: to || undefined,
            }}
          />
        </section>
      </main>
    </AppShell>
  );
}

function ActionLink({
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
      className="rounded-2xl border border-app-border bg-surface p-3 transition hover:border-violet-400/50 sm:p-4"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent-text">
        {icon}
      </span>
      <p className="mt-2 text-xs font-black text-primary">{label}</p>
      <p className="mt-0.5 text-[9px] text-muted">{hint}</p>
    </Link>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-r border-media-border pr-2 last:border-0">
      <p className="truncate text-[9px] text-on-media-muted">{label}</p>
      <p className="mt-1 truncate text-xs font-black text-on-media sm:text-sm">
        {value}
      </p>
    </div>
  );
}

function signedVnd(value: number) {
  if (value === 0) return formatVnd(0);
  return `${value > 0 ? "+" : "−"}${formatVnd(Math.abs(value))}`;
}

function filterHref(state: {
  status: StatusFilter;
  q: string;
  channel: string;
  customerId: string;
  from: string;
  to: string;
}) {
  const params = new URLSearchParams();
  if (state.status !== "ALL") params.set("status", state.status);
  if (state.q) params.set("q", state.q);
  if (state.channel) params.set("channel", state.channel);
  if (state.customerId) params.set("customerId", state.customerId);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  const suffix = params.toString();
  return suffix ? `/ban-hang?${suffix}` : "/ban-hang";
}

function positiveInt(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseDateInput(value?: string) {
  const raw = value?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : raw;
}

function startOfDay(ymd: string) {
  return new Date(`${ymd}T00:00:00`);
}

function endOfDay(ymd: string) {
  return new Date(`${ymd}T23:59:59.999`);
}

function formatDateVi(ymd: string) {
  const [year, month, day] = ymd.split("-");
  return `${day}/${month}/${year}`;
}
