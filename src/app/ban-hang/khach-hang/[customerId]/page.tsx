import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { Pagination } from "@/components/pagination";
import { formatVnd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { PaymentDialog } from "./payment-dialog";

const methodLabels = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  EWALLET: "Ví điện tử",
  OTHER: "Khác",
} as const;

const historyFilters = ["ALL", "UP", "DOWN"] as const;
type HistoryFilter = (typeof historyFilters)[number];

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{
    historyPage?: string;
    ordersPage?: string;
    historyType?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/dang-nhap");
  const { customerId } = await params;
  const query = await searchParams;
  const historyType: HistoryFilter = historyFilters.includes(
    query.historyType as HistoryFilter,
  )
    ? (query.historyType as HistoryFilter)
    : "ALL";
  const requestedHistoryPage = positiveInt(query.historyPage);
  const requestedOrdersPage = positiveInt(query.ordersPage);
  const historyPageSize = 10;
  const ordersPageSize = 6;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId: session.user.id },
  });
  if (!customer) notFound();

  const [purchaseAggregate, paymentGroups, orderCount, historyPaymentCount, refundCount, historyPaidByUsCount] =
    await Promise.all([
      prisma.saleItem.aggregate({
        where: {
          refundedAt: null,
          sale: {
            customerId: customer.id,
            createdById: session.user.id,
            status: { in: ["COMPLETED", "REFUNDED"] },
          },
        },
        _sum: { soldPrice: true },
      }),
      prisma.customerPayment.groupBy({
        by: ["direction"],
        where: { customerId: customer.id },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.sale.count({
        where: {
          customerId: customer.id,
          createdById: session.user.id,
          status: { in: ["COMPLETED", "REFUNDED"] },
        },
      }),
      // Phiếu "Hoàn đơn …" gộp vào dòng REFUND, không đếm riêng trong lịch sử
      prisma.customerPayment.count({
        where: {
          customerId: customer.id,
          NOT: { notes: { startsWith: "Hoàn đơn" } },
        },
      }),
      prisma.saleRefund.count({
        where: {
          sale: {
            customerId: customer.id,
            createdById: session.user.id,
          },
        },
      }),
      prisma.customerPayment.count({
        where: {
          customerId: customer.id,
          direction: "US_TO_CUSTOMER",
          NOT: { notes: { startsWith: "Hoàn đơn" } },
        },
      }),
    ]);

  const purchaseTotal = purchaseAggregate._sum.soldPrice ?? 0;
  const paidToUs =
    paymentGroups.find((row) => row.direction === "CUSTOMER_TO_US")?._sum
      .amount ?? 0;
  const paidByUs =
    paymentGroups.find((row) => row.direction === "US_TO_CUSTOMER")?._sum
      .amount ?? 0;
  const paidToUsCount =
    paymentGroups.find((row) => row.direction === "CUSTOMER_TO_US")?._count ??
    0;
  // Positive: customer owes us. Negative: we owe customer.
  const balance = purchaseTotal + paidByUs - paidToUs;

  const historyCount =
    historyType === "UP"
      ? orderCount + historyPaidByUsCount
      : historyType === "DOWN"
        ? paidToUsCount + refundCount
        : orderCount + historyPaymentCount + refundCount;
  const historyTotalPages = Math.max(
    1,
    Math.ceil(historyCount / historyPageSize),
  );
  const ordersTotalPages = Math.max(
    1,
    Math.ceil(orderCount / ordersPageSize),
  );
  const historyPage = Math.min(requestedHistoryPage, historyTotalPages);
  const ordersPage = Math.min(requestedOrdersPage, ordersTotalPages);

  type ActivityRow = {
    id: string;
    date: Date;
    kind: "SALE" | "PAYMENT" | "REFUND";
    title: string;
    amount: number;
    itemCount: number | null;
    cashAmount: number | null;
    goodsAmount: number | null;
    paidOnSale: number | null;
    method: keyof typeof methodLabels | null;
    notes: string | null;
    saleId: string | null;
  };

  const historyAmountFilter =
    historyType === "UP"
      ? Prisma.sql`WHERE amount > 0`
      : historyType === "DOWN"
        ? Prisma.sql`WHERE amount < 0`
        : Prisma.empty;

  const [activity, orders] = await Promise.all([
    prisma.$queryRaw<ActivityRow[]>(Prisma.sql`
      SELECT *
      FROM (
        SELECT
          s.id,
          COALESCE(s."completedAt", s."updatedAt") AS date,
          'SALE'::text AS kind,
          s.code AS title,
          COALESCE(SUM(si."soldPrice"), 0)::int AS amount,
          COUNT(si.id)::int AS "itemCount",
          NULL::int AS "cashAmount",
          NULL::int AS "goodsAmount",
          NULL::int AS "paidOnSale",
          NULL::text AS method,
          NULL::text AS notes,
          s.id AS "saleId"
        FROM "Sale" s
        LEFT JOIN "SaleItem" si ON si."saleId" = s.id
        WHERE s."customerId" = ${customer.id}
          AND s."createdById" = ${session.user.id}
          AND s.status IN ('COMPLETED', 'REFUNDED')
        GROUP BY s.id

        UNION ALL

        SELECT
          r.id,
          r."createdAt" AS date,
          'REFUND'::text AS kind,
          s.code AS title,
          (r."refundedAmount" - COALESCE(SUM(si."soldPrice"), 0))::int AS amount,
          COUNT(si.id)::int AS "itemCount",
          r."refundedAmount"::int AS "cashAmount",
          COALESCE(SUM(si."soldPrice"), 0)::int AS "goodsAmount",
          COALESCE((
            SELECT SUM(
              CASE
                WHEN p.direction = 'CUSTOMER_TO_US' THEN p.amount
                ELSE -p.amount
              END
            )::int
            FROM "CustomerPayment" p
            WHERE p."saleId" = s.id
              AND (p.notes IS NULL OR p.notes NOT LIKE ${"Hoàn đơn%"})
          ), 0) AS "paidOnSale",
          NULL::text AS method,
          r.notes,
          s.id AS "saleId"
        FROM "SaleRefund" r
        INNER JOIN "Sale" s ON s.id = r."saleId"
        INNER JOIN "SaleItem" si ON si."refundId" = r.id
        WHERE s."customerId" = ${customer.id}
          AND s."createdById" = ${session.user.id}
        GROUP BY r.id, s.id, s.code, r.notes, r."createdAt", r."refundedAmount"

        UNION ALL

        SELECT
          p.id,
          p."paidAt" AS date,
          'PAYMENT'::text AS kind,
          CASE
            WHEN p.direction = 'CUSTOMER_TO_US' THEN 'Khách thanh toán'
            ELSE 'Đã trả / hoàn tiền cho khách'
          END AS title,
          CASE
            WHEN p.direction = 'CUSTOMER_TO_US' THEN -p.amount
            ELSE p.amount
          END::int AS amount,
          NULL::int AS "itemCount",
          NULL::int AS "cashAmount",
          NULL::int AS "goodsAmount",
          NULL::int AS "paidOnSale",
          p.method::text AS method,
          p.notes,
          p."saleId" AS "saleId"
        FROM "CustomerPayment" p
        WHERE p."customerId" = ${customer.id}
          AND (p.notes IS NULL OR p.notes NOT LIKE ${"Hoàn đơn%"})
      ) activity
      ${historyAmountFilter}
      ORDER BY date DESC
      LIMIT ${historyPageSize}
      OFFSET ${(historyPage - 1) * historyPageSize}
    `),
    prisma.sale.findMany({
      where: {
        customerId: customer.id,
        createdById: session.user.id,
        status: { in: ["COMPLETED", "REFUNDED"] },
      },
      include: {
        items: {
          include: {
            inventoryItem: {
              include: {
                card: {
                  select: {
                    id: true,
                    name: true,
                    referenceImage: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { completedAt: "desc" },
      skip: (ordersPage - 1) * ordersPageSize,
      take: ordersPageSize,
    }),
  ]);

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-5 sm:px-6 lg:py-10">
        <header className="flex items-center justify-between gap-3">
          <BackButton
            href="/ban-hang/khach-hang"
            label="Quay lại khách hàng"
          />
          <PaymentDialog
            customerId={customer.id}
            customerName={customer.name}
            balance={balance}
          />
        </header>

        <section className="mt-5 overflow-hidden rounded-3xl border border-app-border bg-surface">
          <div className="bg-[radial-gradient(circle_at_90%_10%,rgba(139,92,246,0.24),transparent_38%),linear-gradient(135deg,#292467,#171742_58%,#10152e)] p-5 text-on-media sm:p-6">
            <div className="flex items-start gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-media-border bg-white/10">
                <UserRound size={25} />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-black sm:text-2xl">
                  {customer.name}
                </h1>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-on-media-muted">
                  {customer.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone size={11} />
                      {customer.phone}
                    </span>
                  )}
                  {customer.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail size={11} />
                      {customer.email}
                    </span>
                  )}
                  {customer.address && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={11} />
                      {customer.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2 border-t border-media-border pt-4 sm:grid-cols-4">
              <HeroMetric
                label="Tổng mua (còn)"
                value={formatVnd(purchaseTotal)}
              />
              <HeroMetric
                label="Khách đã trả"
                value={formatSignedVnd(-paidToUs)}
              />
              <HeroMetric
                label="Mình đã trả khách"
                value={formatSignedVnd(paidByUs)}
              />
              <HeroMetric label="Số đơn" value={String(orderCount)} />
            </div>
          </div>
        </section>

        <section
          className={`mt-4 rounded-2xl border p-5 ${
            balance > 0
              ? "border-amber-500/25 bg-amber-500/10"
              : balance < 0
                ? "border-sky-500/25 bg-sky-500/10"
                : "border-emerald-500/25 bg-emerald-500/10"
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Công nợ hiện tại
              </p>
              <p
                className={`mt-1 text-2xl font-black ${
                  balance > 0
                    ? "text-amber-600"
                    : balance < 0
                      ? "text-sky-600"
                      : "text-emerald-600"
                }`}
              >
                {formatSignedVnd(balance)}
              </p>
              <p className="mt-1 text-[10px] text-secondary">
                {balance > 0
                  ? "Khách đang nợ mình"
                  : balance < 0
                    ? "Mình đang nợ khách"
                    : "Đã cân bằng công nợ"}
              </p>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface/70 text-accent-text">
              <WalletCards size={22} />
            </span>
          </div>
        </section>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-app-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-primary">
                  Lịch sử công nợ
                </h2>
                <p className="mt-1 text-[9px] text-muted">
                  + nợ tăng · − nợ giảm. Hoàn: xoá bill (−) và trả tiền (+);
                  nếu trả nhiều hơn đã thu sẽ ghi “thừa trả”.
                </p>
              </div>
              <ReceiptText size={18} className="text-accent-text" />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {historyFilters.map((value) => (
                <Link
                  key={value}
                  href={historyFilterHref(
                    customer.id,
                    value,
                    ordersPage > 1 ? ordersPage : undefined,
                  )}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-[10px] font-black ${
                    historyType === value
                      ? "bg-accent text-white"
                      : "border border-app-border bg-panel text-secondary"
                  }`}
                >
                  {
                    {
                      ALL: "Tất cả",
                      UP: "Nợ tăng",
                      DOWN: "Nợ giảm",
                    }[value]
                  }
                </Link>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {activity.length === 0 ? (
                <p className="rounded-xl border border-dashed border-app-border p-6 text-center text-xs text-muted">
                  {historyType === "UP"
                    ? "Chưa có lần nợ tăng."
                    : historyType === "DOWN"
                      ? "Chưa có lần nợ giảm."
                      : "Chưa có phát sinh."}
                </p>
              ) : (
                activity.map((entry) => {
                  const goods = entry.goodsAmount ?? 0;
                  const cash = entry.cashAmount ?? 0;
                  const paidOnSale = entry.paidOnSale ?? 0;
                  const overpay =
                    entry.kind === "REFUND" ? Math.max(0, cash - paidOnSale) : 0;
                  const underpay =
                    entry.kind === "REFUND" ? Math.max(0, paidOnSale - cash) : 0;
                  const title =
                    entry.kind === "SALE"
                      ? `Khách mua ${entry.itemCount ?? 0} sản phẩm`
                      : entry.kind === "REFUND"
                        ? overpay > 0
                          ? `Hoàn ${entry.itemCount ?? 0} SP · thừa trả khách`
                          : underpay > 0
                            ? `Hoàn ${entry.itemCount ?? 0} SP · còn giữ của khách`
                            : entry.amount === 0
                              ? `Hoàn ${entry.itemCount ?? 0} SP · đúng số đã thu`
                              : entry.amount < 0
                                ? `Hoàn ${entry.itemCount ?? 0} SP · nợ giảm`
                                : `Hoàn ${entry.itemCount ?? 0} SP · nợ tăng`
                        : entry.amount < 0
                          ? "Khách đã trả tiền"
                          : "Đã trả / hoàn tiền cho khách";
                  const subtitle =
                    entry.kind === "SALE"
                      ? `Đơn ${entry.title}`
                      : entry.kind === "REFUND"
                        ? [
                            `Đơn ${entry.title}`,
                            `Xoá bill ${formatSignedVnd(-goods)}`,
                            cash > 0
                              ? `Trả khách ${formatSignedVnd(cash)}`
                              : "Không trả tiền",
                            paidOnSale > 0
                              ? `Đã thu trước ${formatVnd(paidOnSale)}`
                              : null,
                            overpay > 0
                              ? `Thừa trả ${formatSignedVnd(overpay)}`
                              : null,
                            underpay > 0
                              ? `Còn giữ của khách ${formatSignedVnd(-underpay)}`
                              : null,
                            entry.notes,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : `${entry.method ? methodLabels[entry.method] : "Khác"}${
                            entry.notes ? ` · ${entry.notes}` : ""
                          }`;
                  const href =
                    entry.saleId != null
                      ? `/ban-hang/${entry.saleId}`
                      : null;
                  const tone =
                    overpay > 0
                      ? "over"
                      : entry.amount === 0
                        ? "neutral"
                        : entry.amount > 0
                          ? "up"
                          : "down";
                  const content = (
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                          tone === "up"
                            ? "bg-amber-500/12 text-amber-600"
                            : tone === "down"
                              ? "bg-emerald-500/12 text-emerald-600"
                              : tone === "over"
                                ? "bg-rose-500/12 text-rose-500"
                                : "bg-slate-500/12 text-slate-500"
                        }`}
                      >
                        {tone === "up" ? (
                          <ArrowUpRight size={16} />
                        ) : (
                          <ArrowDownLeft size={16} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-primary">
                          {title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[9px] text-muted">
                          {entry.date.toLocaleDateString("vi-VN")} · {subtitle}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-xs font-black ${
                            tone === "up"
                              ? "text-amber-600"
                              : tone === "down"
                                ? "text-emerald-600"
                                : tone === "over"
                                  ? "text-rose-500"
                                  : "text-slate-500"
                          }`}
                        >
                          {overpay > 0
                            ? formatSignedVnd(overpay)
                            : formatSignedVnd(entry.amount)}
                        </p>
                        {overpay > 0 && (
                          <p className="mt-0.5 text-[8px] font-bold text-rose-500">
                            khách giữ thừa
                          </p>
                        )}
                        {underpay > 0 && overpay === 0 && (
                          <p className="mt-0.5 text-[8px] font-bold text-sky-600">
                            mình còn giữ
                          </p>
                        )}
                      </div>
                    </div>
                  );
                  return href ? (
                    <Link
                      key={`${entry.kind}-${entry.id}`}
                      href={href}
                      className="block rounded-xl border border-app-border bg-panel p-3 transition hover:border-violet-400/50"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div
                      key={`${entry.kind}-${entry.id}`}
                      className="rounded-xl border border-app-border bg-panel p-3"
                    >
                      {content}
                    </div>
                  );
                })
              )}
            </div>
            <Pagination
              currentPage={historyPage}
              totalPages={historyTotalPages}
              basePath={`/ban-hang/khach-hang/${customer.id}`}
              pageParam="historyPage"
              params={{
                ordersPage: ordersPage > 1 ? ordersPage : undefined,
                historyType: historyType === "ALL" ? undefined : historyType,
              }}
            />
          </section>

          <section className="rounded-3xl border border-app-border bg-surface p-5">
            <h2 className="text-sm font-black text-primary">Đơn đã mua</h2>
            <div className="mt-4 space-y-2">
              {orders.length === 0 ? (
                <p className="rounded-xl border border-dashed border-app-border p-6 text-center text-xs text-muted">
                  Chưa có đơn hàng.
                </p>
              ) : (
                orders.map((sale) => {
                  const total = sale.items
                    .filter((item) => !item.refundedAt)
                    .reduce((sum, item) => sum + item.soldPrice, 0);
                  const image =
                    sale.items[0]?.inventoryItem.imageUrl ??
                    sale.items[0]?.inventoryItem.card.referenceImage;
                  return (
                    <Link
                      key={sale.id}
                      href={`/ban-hang/${sale.id}`}
                      className="flex items-center gap-3 rounded-xl border border-app-border bg-panel p-3 transition hover:border-violet-400/50"
                    >
                      <div className="grid h-12 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface">
                        {image && (
                          <img
                            src={image}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-primary">
                          {sale.code}
                        </p>
                        <p className="mt-0.5 text-[9px] text-muted">
                          {(sale.completedAt ?? sale.updatedAt).toLocaleDateString(
                            "vi-VN",
                          )}{" "}
                          · {sale.items.length} mục
                        </p>
                      </div>
                      <p className="text-xs font-black text-primary">
                        {formatVnd(total)}
                      </p>
                    </Link>
                  );
                })
              )}
            </div>
            <Pagination
              currentPage={ordersPage}
              totalPages={ordersTotalPages}
              basePath={`/ban-hang/khach-hang/${customer.id}`}
              pageParam="ordersPage"
              params={{
                historyPage: historyPage > 1 ? historyPage : undefined,
                historyType: historyType === "ALL" ? undefined : historyType,
              }}
            />
          </section>
        </div>

        {customer.notes && (
          <section className="mt-4 rounded-2xl border border-app-border bg-surface p-4">
            <p className="text-[10px] font-bold text-muted">Ghi chú</p>
            <p className="mt-2 whitespace-pre-line text-xs leading-5 text-secondary">
              {customer.notes}
            </p>
          </section>
        )}
      </main>
    </AppShell>
  );
}

function historyFilterHref(
  customerId: string,
  type: HistoryFilter,
  ordersPage?: number,
) {
  const search = new URLSearchParams();
  if (type !== "ALL") search.set("historyType", type);
  if (ordersPage) search.set("ordersPage", String(ordersPage));
  const query = search.toString();
  return query
    ? `/ban-hang/khach-hang/${customerId}?${query}`
    : `/ban-hang/khach-hang/${customerId}`;
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

function formatSignedVnd(amount: number) {
  if (amount === 0) return formatVnd(0);
  return `${amount > 0 ? "+" : "−"}${formatVnd(Math.abs(amount))}`;
}

function positiveInt(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
