import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarRange,
  ChevronDown,
  CircleDollarSign,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { formatVnd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { salesChannelLabel } from "@/lib/sales-channels";

const periods = ["TODAY", "7D", "MONTH", "CUSTOM"] as const;
type Period = (typeof periods)[number];
type Query = {
  period?: string;
  from?: string;
  to?: string;
  collectionId?: string;
  seriesId?: string;
  cardId?: string;
};
type BreakdownRow = { name: string; value: number; count: number };

const chartColors = [
  "#8b5cf6",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#f43f5e",
  "#6366f1",
  "#94a3b8",
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/dang-nhap");
  const query = await searchParams;
  const period: Period = periods.includes(query.period as Period)
    ? (query.period as Period)
    : "MONTH";
  const range = reportRange(period, query.from, query.to);

  const categories = await prisma.category.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true, parentId: true },
    orderBy: { name: "asc" },
  });
  const collections = categories.filter((category) => !category.parentId);
  const collectionId = collections.some(
    (category) => category.id === query.collectionId,
  )
    ? query.collectionId
    : undefined;
  const series = categories.filter(
    (category) =>
      category.parentId && (!collectionId || category.parentId === collectionId),
  );
  const seriesId = series.some((category) => category.id === query.seriesId)
    ? query.seriesId
    : undefined;
  const cards = await prisma.card.findMany({
    where: {
      userId: session.user.id,
      ...(seriesId
        ? { categoryId: seriesId }
        : collectionId
          ? {
              OR: [
                { categoryId: collectionId },
                { category: { parentId: collectionId } },
              ],
            }
          : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const cardId = cards.some((card) => card.id === query.cardId)
    ? query.cardId
    : undefined;

  const [sales, payments, refundedItemTotals, refundExpenseTotals] =
    await Promise.all([
    prisma.sale.findMany({
      where: {
        createdById: session.user.id,
        status: { in: ["COMPLETED", "REFUNDED"] },
        completedAt: { gte: range.start, lt: range.end },
      },
      select: {
        completedAt: true,
        salesChannel: true,
        customerId: true,
        items: {
          select: {
            soldPrice: true,
            costPrice: true,
            refundedAt: true,
            inventoryItem: {
              select: {
                card: {
                  select: {
                    id: true,
                    name: true,
                    categoryId: true,
                    category: {
                      select: {
                        id: true,
                        name: true,
                        parentId: true,
                        parent: { select: { name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        expenses: { select: { amount: true, type: true } },
      },
      orderBy: { completedAt: "asc" },
    }),
    prisma.customerPayment.findMany({
      where: {
        customer: { userId: session.user.id },
        paidAt: { gte: range.start, lt: range.end },
      },
      select: { amount: true, direction: true },
    }),
    prisma.saleItem.aggregate({
      where: {
        refundedAt: { gte: range.start, lt: range.end },
        sale: { createdById: session.user.id },
      },
      _sum: { soldPrice: true },
      _count: true,
    }),
    prisma.saleExpense.aggregate({
      where: {
        type: "REFUND",
        createdAt: { gte: range.start, lt: range.end },
        sale: { createdById: session.user.id },
      },
      _sum: { amount: true },
    }),
  ]);

  const rows = sales.flatMap((sale) => {
    const matchedItems = sale.items.filter((item) => {
      if (item.refundedAt) return false;
      const card = item.inventoryItem.card;
      const category = card.category;
      if (cardId && card.id !== cardId) return false;
      if (seriesId && card.categoryId !== seriesId) return false;
      if (
        collectionId &&
        category?.id !== collectionId &&
        category?.parentId !== collectionId
      ) {
        return false;
      }
      return true;
    });
    if (!matchedItems.length) return [];
    const activeItems = sale.items.filter((item) => !item.refundedAt);
    const fullRevenue = sum(activeItems.map((item) => item.soldPrice));
    const revenue = sum(matchedItems.map((item) => item.soldPrice));
    const capital = sum(matchedItems.map((item) => item.costPrice));
    const fullExpenses = sum(
      sale.expenses
        .filter((expense) => expense.type !== "REFUND")
        .map((expense) => expense.amount),
    );
    const expenses =
      fullRevenue > 0 ? Math.round((fullExpenses * revenue) / fullRevenue) : 0;
    return [
      {
        ...sale,
        matchedItems,
        revenue,
        capital,
        expenses,
        profit: revenue - capital - expenses,
      },
    ];
  });

  const revenue = sum(rows.map((row) => row.revenue));
  const capital = sum(rows.map((row) => row.capital));
  const expenses = sum(rows.map((row) => row.expenses));
  const profit = revenue - capital - expenses;
  const refundedGoods = refundedItemTotals._sum.soldPrice ?? 0;
  const refundedItemCount = refundedItemTotals._count;
  const refundFees = refundExpenseTotals._sum.amount ?? 0;
  const daily = dailyRows(rows, range.start);
  const channels = groupValues(
    rows,
    (row) => salesChannelLabel(row.salesChannel),
    (row) => row.revenue,
  );
  const collectionBreakdown = groupItems(rows, "collection");
  const topProducts = groupItems(rows, "card").slice(0, 5);
  const topSeries = groupItems(rows, "series").slice(0, 5);

  const debtCreated = sum(
    sales
      .filter((sale) => sale.customerId)
      .flatMap((sale) =>
        sale.items
          .filter((item) => !item.refundedAt)
          .map((item) => item.soldPrice),
      ),
  );
  const debtCollected = sum(
    payments
      .filter((payment) => payment.direction === "CUSTOMER_TO_US")
      .map((payment) => payment.amount),
  );
  const refunded = sum(
    payments
      .filter((payment) => payment.direction === "US_TO_CUSTOMER")
      .map((payment) => payment.amount),
  );

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6 lg:px-10 lg:py-10">
        <BackButton href="/ban-hang" label="Quay lại giao dịch" />
        <header className="mt-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-accent-text">
              Bán hàng
            </p>
            <h1 className="mt-1 text-2xl font-black text-primary sm:text-3xl">
              Báo cáo
            </h1>
            <p className="mt-1 text-xs text-muted">
              {range.label} · doanh thu chỉ tính mục chưa hoàn
            </p>
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-text">
            <BarChart3 size={22} />
          </span>
        </header>

        <section className="mt-5 rounded-3xl border border-app-border bg-surface p-4 sm:p-5">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {periods.map((value) => (
              <Link
                key={value}
                href={periodHref(value, {
                  collectionId,
                  seriesId,
                  cardId,
                  from: range.from,
                  to: range.to,
                })}
                className={`shrink-0 rounded-full px-3.5 py-2 text-[10px] font-black ${
                  period === value
                    ? "bg-accent text-white"
                    : "border border-app-border bg-panel text-secondary"
                }`}
              >
                {
                  {
                    TODAY: "Hôm nay",
                    "7D": "7 ngày",
                    MONTH: "Tháng này",
                    CUSTOM: "Tùy chọn ngày",
                  }[value]
                }
              </Link>
            ))}
          </div>
          <details
            className="group mt-3 rounded-2xl border border-app-border bg-panel"
            open={period === "CUSTOM" ? true : undefined}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-black text-primary [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal size={15} className="text-accent-text" />
              <span className="flex-1">Bộ lọc chi tiết</span>
              {[collectionId, seriesId, cardId].filter(Boolean).length > 0 && (
                <span className="rounded-full bg-accent-soft px-2 py-1 text-[8px] text-accent-text">
                  {[collectionId, seriesId, cardId].filter(Boolean).length} đang
                  dùng
                </span>
              )}
              <ChevronDown
                size={15}
                className="text-muted transition group-open:rotate-180"
              />
            </summary>
            <form className="grid gap-3 border-t border-app-border p-4 sm:grid-cols-2 lg:grid-cols-3">
              <input type="hidden" name="period" value={period} />
              <FilterSelect
                name="collectionId"
                label="Bộ sưu tập"
                value={collectionId}
                options={collections}
                emptyLabel="Tất cả bộ sưu tập"
              />
              <FilterSelect
                name="seriesId"
                label="Series"
                value={seriesId}
                options={series}
                emptyLabel="Tất cả series"
              />
              <FilterSelect
                name="cardId"
                label="Sản phẩm"
                value={cardId}
                options={cards}
                emptyLabel="Tất cả sản phẩm"
              />
              <DateField
                name="from"
                label="Từ ngày"
                value={range.from}
                disabled={period !== "CUSTOM"}
              />
              <DateField
                name="to"
                label="Đến ngày"
                value={range.to}
                disabled={period !== "CUSTOM"}
              />
              <button className="self-end rounded-xl bg-accent px-4 py-3 text-xs font-black text-white">
                Áp dụng bộ lọc
              </button>
            </form>
          </details>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Doanh thu"
            value={formatVnd(revenue)}
            icon={<CircleDollarSign size={18} />}
          />
          <Metric
            label="Giá vốn"
            value={formatVnd(capital)}
            icon={<Boxes size={18} />}
          />
          <Metric
            label="Chi phí đơn"
            value={formatVnd(expenses)}
            icon={<ReceiptText size={18} />}
          />
          <Metric
            label={profit >= 0 ? "Lãi thực" : "Lỗ thực"}
            value={formatVnd(Math.abs(profit))}
            icon={
              profit >= 0 ? (
                <ArrowUpRight size={18} />
              ) : (
                <ArrowDownRight size={18} />
              )
            }
            tone={profit >= 0 ? "positive" : "negative"}
          />
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metric
            label="Đã hoàn (hàng)"
            value={formatVnd(refundedGoods)}
            icon={<RotateCcw size={18} />}
          />
          <Metric
            label="Số mục hoàn"
            value={`${refundedItemCount} mục`}
            icon={<Boxes size={18} />}
          />
          <Metric
            label="Chi phí hoàn"
            value={formatVnd(refundFees)}
            icon={<ReceiptText size={18} />}
          />
        </section>

        <section className="mt-4 rounded-3xl border border-app-border bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-primary">
                Doanh thu và lãi theo ngày
              </h2>
              <p className="mt-1 text-[9px] text-muted">
                Tím: doanh thu · xanh/đỏ: lãi hoặc lỗ
              </p>
            </div>
            <CalendarRange size={18} className="text-accent-text" />
          </div>
          <DailyChart data={daily} />
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <BreakdownCard title="Doanh thu theo kênh bán" rows={channels} />
          <BreakdownCard
            title="Doanh thu theo bộ sưu tập"
            rows={collectionBreakdown}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <RankingCard
            title="Top sản phẩm bán chạy"
            rows={topProducts}
            emptyText="Chưa có sản phẩm bán trong kỳ."
          />
          <RankingCard
            title="Top series"
            rows={topSeries}
            emptyText="Chưa có series bán trong kỳ."
          />
        </div>

        <section className="mt-4 rounded-3xl border border-app-border bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-primary">
                Công nợ trong kỳ
              </h2>
              <p className="mt-1 text-[9px] text-muted">
                Tính theo thời gian, không phụ thuộc bộ lọc sản phẩm.
              </p>
            </div>
            <WalletCards size={19} className="text-accent-text" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <DebtValue label="Nợ phát sinh" value={debtCreated} tone="amber" />
            <DebtValue label="Đã thu" value={debtCollected} tone="green" />
            <DebtValue label="Đã trả/hoàn" value={refunded} tone="blue" />
          </div>
          <Link
            href="/ban-hang/so-no"
            className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black text-accent-text"
          >
            Mở sổ nợ <ArrowUpRight size={13} />
          </Link>
        </section>
      </main>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <article className="rounded-2xl border border-app-border bg-surface p-4">
      <div
        className={`grid h-9 w-9 place-items-center rounded-xl ${
          tone === "positive"
            ? "bg-emerald-500/12 text-emerald-600"
            : tone === "negative"
              ? "bg-rose-500/12 text-rose-500"
              : "bg-accent-soft text-accent-text"
        }`}
      >
        {icon}
      </div>
      <p className="mt-3 text-[9px] font-bold text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-primary sm:text-lg">
        {value}
      </p>
    </article>
  );
}

function DailyChart({
  data,
}: {
  data: Array<{ label: string; revenue: number; profit: number }>;
}) {
  if (!data.length) return <Empty text="Chưa có doanh thu trong kỳ này." />;
  const max = Math.max(
    1,
    ...data.flatMap((row) => [row.revenue, Math.abs(row.profit)]),
  );
  return (
    <div className="mt-5 overflow-x-auto pb-2">
      <div
        className="flex h-52 min-w-max items-end gap-3"
        style={{ width: `${Math.max(100, data.length * 16)}%` }}
      >
        {data.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            className="flex h-full min-w-11 flex-1 flex-col justify-end"
            title={`${row.label}: doanh thu ${formatVnd(row.revenue)}, lãi ${formatVnd(row.profit)}`}
          >
            <div className="flex h-40 items-end justify-center gap-1">
              <div
                className="w-3 rounded-t bg-violet-500"
                style={{ height: `${Math.max(3, (row.revenue / max) * 100)}%` }}
              />
              <div
                className={`w-3 rounded-t ${row.profit >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                style={{
                  height: `${Math.max(3, (Math.abs(row.profit) / max) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-center text-[8px] text-muted">
              {row.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: BreakdownRow[];
}) {
  const visible = rows.slice(0, 6);
  const total = sum(rows.map((row) => row.value));
  return (
    <section className="rounded-3xl border border-app-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-black text-primary">{title}</h2>
      {total === 0 ? (
        <Empty text="Chưa có dữ liệu trong kỳ." />
      ) : (
        <div className="mt-5 flex items-center gap-5">
          <div
            className="relative h-28 w-28 shrink-0 rounded-full"
            style={{ background: pieGradient(visible, total) }}
          >
            <div className="absolute inset-5 grid place-items-center rounded-full bg-surface text-center">
              <span className="text-[9px] font-black text-primary">
                {formatVnd(total)}
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            {visible.map((row, index) => (
              <div key={row.name} className="flex items-center gap-2 text-[9px]">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: chartColors[index] }}
                />
                <span className="min-w-0 flex-1 truncate text-secondary">
                  {row.name}
                </span>
                <span className="font-black text-primary">
                  {Math.round((row.value / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function RankingCard({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: BreakdownRow[];
  emptyText: string;
}) {
  return (
    <section className="rounded-3xl border border-app-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-primary">{title}</h2>
        <PackageCheck size={18} className="text-accent-text" />
      </div>
      <div className="mt-4 space-y-2">
        {rows.length ? (
          rows.map((row, index) => (
            <div
              key={row.name}
              className="flex items-center gap-3 rounded-xl border border-app-border bg-panel p-3"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-[10px] font-black text-accent-text">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-primary">
                  {row.name}
                </p>
                <p className="mt-0.5 text-[8px] text-muted">
                  Đã bán {row.count} tấm
                </p>
              </div>
              <p className="shrink-0 text-[10px] font-black text-primary">
                {formatVnd(row.value)}
              </p>
            </div>
          ))
        ) : (
          <Empty text={emptyText} />
        )}
      </div>
    </section>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
  emptyLabel,
}: {
  name: string;
  label: string;
  value?: string;
  options: Array<{ id: string; name: string }>;
  emptyLabel: string;
}) {
  return (
    <label>
      <span className="text-[9px] font-bold text-muted">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-3 text-xs text-primary outline-none focus:border-violet-400"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField({
  name,
  label,
  value,
  disabled,
}: {
  name: string;
  label: string;
  value: string;
  disabled: boolean;
}) {
  return (
    <label>
      <span className="text-[9px] font-bold text-muted">{label}</span>
      <input
        type="date"
        name={name}
        defaultValue={value}
        readOnly={disabled}
        className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-3 text-xs text-primary outline-none read-only:opacity-60 focus:border-violet-400"
      />
    </label>
  );
}

function DebtValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "green" | "blue";
}) {
  const colors = {
    amber: "text-amber-600",
    green: "text-emerald-600",
    blue: "text-sky-600",
  };
  return (
    <div className="rounded-xl bg-panel p-3">
      <p className="text-[8px] text-muted">{label}</p>
      <p className={`mt-1 truncate text-xs font-black ${colors[tone]}`}>
        {formatVnd(value)}
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="mt-4 rounded-2xl border border-dashed border-app-border p-8 text-center text-xs text-muted">
      {text}
    </p>
  );
}

function dailyRows(
  rows: Array<{
    completedAt: Date | null;
    revenue: number;
    profit: number;
  }>,
  fallback: Date,
) {
  const groups = new Map<
    string,
    { label: string; revenue: number; profit: number }
  >();
  for (const row of rows) {
    const date = row.completedAt ?? fallback;
    const key = dateKey(date);
    const current = groups.get(key) ?? {
      label: shortDate(date),
      revenue: 0,
      profit: 0,
    };
    current.revenue += row.revenue;
    current.profit += row.profit;
    groups.set(key, current);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
}

function groupValues<T>(
  rows: T[],
  name: (row: T) => string,
  value: (row: T) => number,
) {
  const groups = new Map<string, BreakdownRow>();
  for (const row of rows) {
    const key = name(row);
    const current = groups.get(key) ?? { name: key, value: 0, count: 0 };
    current.value += value(row);
    current.count += 1;
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.value - a.value);
}

function groupItems(
  rows: Array<{
    matchedItems: Array<{
      soldPrice: number;
      inventoryItem: {
        card: {
          name: string;
          category: {
            name: string;
            parent: { name: string } | null;
          } | null;
        };
      };
    }>;
  }>,
  type: "card" | "series" | "collection",
) {
  const groups = new Map<string, BreakdownRow>();
  for (const row of rows) {
    for (const item of row.matchedItems) {
      const card = item.inventoryItem.card;
      const category = card.category;
      const name =
        type === "card"
          ? card.name
          : type === "series"
            ? category?.parent
              ? category.name
              : "Không có series"
            : category?.parent?.name ?? category?.name ?? "Chưa phân loại";
      const current = groups.get(name) ?? { name, value: 0, count: 0 };
      current.value += item.soldPrice;
      current.count += 1;
      groups.set(name, current);
    }
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || b.value - a.value,
  );
}

function pieGradient(rows: BreakdownRow[], total: number) {
  let cursor = 0;
  const stops = rows.map((row, index) => {
    const start = cursor;
    cursor += (row.value / total) * 100;
    return `${chartColors[index]} ${start}% ${cursor}%`;
  });
  if (cursor < 100) stops.push(`${chartColors[6]} ${cursor}% 100%`);
  return `conic-gradient(${stops.join(", ")})`;
}

function periodHref(
  period: Period,
  values: {
    collectionId?: string;
    seriesId?: string;
    cardId?: string;
    from: string;
    to: string;
  },
) {
  const params = new URLSearchParams();
  if (period !== "MONTH") params.set("period", period);
  if (period === "CUSTOM") {
    params.set("from", values.from);
    params.set("to", values.to);
  }
  if (values.collectionId) params.set("collectionId", values.collectionId);
  if (values.seriesId) params.set("seriesId", values.seriesId);
  if (values.cardId) params.set("cardId", values.cardId);
  return `/ban-hang/bao-cao${params.size ? `?${params}` : ""}`;
}

function reportRange(period: Period, from?: string, to?: string) {
  const today = dateKey(new Date());
  let startKey = today;
  let endKey = today;
  if (period === "7D") startKey = shiftDate(today, -6);
  if (period === "MONTH") startKey = `${today.slice(0, 7)}-01`;
  if (period === "CUSTOM" && validDate(from) && validDate(to) && from <= to) {
    startKey = from;
    endKey = to;
  }
  return {
    start: vietnamDate(startKey),
    end: vietnamDate(shiftDate(endKey, 1)),
    from: startKey,
    to: endKey,
    label:
      startKey === endKey
        ? formatDateLabel(startKey)
        : `${formatDateLabel(startKey)} – ${formatDateLabel(endKey)}`,
  };
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function vietnamDate(value: string) {
  return new Date(`${value}T00:00:00+07:00`);
}

function shiftDate(value: string, days: number) {
  const date = vietnamDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

function validDate(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatDateLabel(value: string) {
  return vietnamDate(value).toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
