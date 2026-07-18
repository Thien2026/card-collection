import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CalendarDays,
  CircleDollarSign,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { formatVnd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { salesChannelLabel } from "@/lib/sales-channels";
import { SaleRowActions } from "../sale-row-actions";
import { SalePaymentDialog } from "../sale-payment-dialog";
import { SaleRefundDialog } from "../sale-refund-dialog";

const statusCopy = {
  DRAFT: { label: "Nháp", className: "bg-amber-500/12 text-amber-600" },
  COMPLETED: {
    label: "Hoàn tất",
    className: "bg-emerald-500/12 text-emerald-600",
  },
  CANCELLED: { label: "Đã huỷ", className: "bg-rose-500/12 text-rose-600" },
  REFUNDED: { label: "Đã hoàn", className: "bg-slate-500/15 text-slate-600" },
} as const;

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/dang-nhap");
  const { saleId } = await params;

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, createdById: session.user.id },
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
                  category: {
                    select: {
                      name: true,
                      parent: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      expenses: true,
      payments: { orderBy: { paidAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!sale) notFound();

  const activeItems = sale.items.filter((item) => !item.refundedAt);
  const refundedItems = sale.items.filter((item) => item.refundedAt);
  const revenue = activeItems.reduce((sum, item) => sum + item.soldPrice, 0);
  const capital = activeItems.reduce((sum, item) => sum + item.costPrice, 0);
  const refundedValue = refundedItems.reduce(
    (sum, item) => sum + item.soldPrice,
    0,
  );
  const expenses = sale.expenses.reduce((sum, item) => sum + item.amount, 0);
  const paidAmount = sale.payments.reduce(
    (sum, payment) =>
      sum +
      (payment.direction === "CUSTOMER_TO_US"
        ? payment.amount
        : -payment.amount),
    0,
  );
  const remaining = revenue - paidAmount;
  const profit = revenue - capital - expenses;

  let customerBalance: number | null = null;
  if (sale.customerId) {
    const [purchaseAggregate, paymentGroups] = await Promise.all([
      prisma.saleItem.aggregate({
        where: {
          refundedAt: null,
          sale: {
            customerId: sale.customerId,
            createdById: session.user.id,
            status: { in: ["COMPLETED", "REFUNDED"] },
          },
        },
        _sum: { soldPrice: true },
      }),
      prisma.customerPayment.groupBy({
        by: ["direction"],
        where: { customerId: sale.customerId },
        _sum: { amount: true },
      }),
    ]);
    const purchaseTotal = purchaseAggregate._sum.soldPrice ?? 0;
    const paidToUs =
      paymentGroups.find((row) => row.direction === "CUSTOMER_TO_US")?._sum
        .amount ?? 0;
    const paidByUs =
      paymentGroups.find((row) => row.direction === "US_TO_CUSTOMER")?._sum
        .amount ?? 0;
    customerBalance = purchaseTotal + paidByUs - paidToUs;
  }

  const partiallyRefunded =
    sale.status === "COMPLETED" && refundedItems.length > 0;
  const status = partiallyRefunded
    ? {
        label: "Hoàn một phần",
        className: "bg-amber-500/12 text-amber-700",
      }
    : statusCopy[sale.status];
  const date =
    sale.refundedAt ??
    sale.completedAt ??
    sale.cancelledAt ??
    sale.updatedAt;

  const refundableItems = activeItems.map((item) => {
    const card = item.inventoryItem.card;
    return {
      id: item.id,
      name: card.name,
      soldPrice: item.soldPrice,
      meta: [
        card.category?.parent?.name,
        card.category?.name,
        item.inventoryItem.condition,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-5 sm:px-6 lg:py-10">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <BackButton href="/ban-hang" label="Quay lại giao dịch" />
          <div className="flex flex-wrap items-center gap-2">
            {refundableItems.length > 0 &&
              (sale.status === "COMPLETED" || sale.status === "REFUNDED") && (
                <SaleRefundDialog
                  saleId={sale.id}
                  saleCode={sale.code}
                  hasCustomer={Boolean(sale.customerId)}
                  customerId={sale.customerId}
                  customerName={sale.customerName}
                  customerBalance={customerBalance}
                  orderBill={revenue}
                  orderPaid={paidAmount}
                  items={refundableItems}
                />
              )}
            {sale.customerId &&
              sale.status !== "CANCELLED" &&
              sale.status !== "REFUNDED" && (
                <SalePaymentDialog
                  saleId={sale.id}
                  customerId={sale.customerId}
                  customerName={sale.customerName || "Khách"}
                  remaining={remaining}
                />
              )}
            <SaleRowActions
              saleId={sale.id}
              code={sale.code}
              status={sale.status}
            />
          </div>
        </header>

        <section className="rounded-3xl border border-app-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-primary">{sale.code}</h1>
                <span
                  className={`rounded-full px-2.5 py-1 text-[9px] font-black ${status.className}`}
                >
                  {status.label}
                </span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <CalendarDays size={13} />
                {date.toLocaleString("vi-VN")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted">Tổng bill còn hiệu lực</p>
              <p className="text-xl font-black text-primary">
                {formatVnd(revenue)}
              </p>
              {refundedValue > 0 && (
                <p className="mt-1 text-[10px] font-bold text-slate-500">
                  Đã hoàn {formatVnd(refundedValue)}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Giá vốn" value={formatVnd(capital)} />
            <Metric label="Chi phí" value={formatVnd(expenses)} />
            <Metric label="Đã thanh toán" value={formatVnd(paidAmount)} />
            <Metric
              label="Còn lại"
              value={formatVnd(remaining)}
              tone={
                remaining > 0
                  ? "negative"
                  : remaining < 0
                    ? "positive"
                    : "neutral"
              }
            />
            <Metric
              label="Lãi/lỗ"
              value={signedVnd(profit)}
              tone={profit < 0 ? "negative" : profit > 0 ? "positive" : "neutral"}
            />
            <Metric
              label="Số mục"
              value={`${activeItems.length}/${sale.items.length}`}
            />
          </div>

          {!sale.customerId && sale.status !== "CANCELLED" && (
            <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-[10px] text-amber-700">
              Đơn khách lẻ: muốn trả góp nhiều lần thì gắn khách hàng khi tạo
              đơn (hoặc quản lý công nợ từ trang Khách hàng).
            </p>
          )}
          {sale.customerId && remaining > 0 && sale.status === "COMPLETED" && (
            <p className="mt-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-[10px] text-emerald-700">
              Thanh toán nhiều lần: bấm “Thêm thanh toán” mỗi khi khách trả một
              phần. Hệ thống cộng dồn đến khi hết nợ.
            </p>
          )}

          <div className="mt-5 grid gap-2 text-xs text-secondary sm:grid-cols-2">
            <Info
              icon={<UserRound size={14} />}
              label="Khách hàng"
              value={sale.customerName || "Khách lẻ"}
            />
            <Info
              icon={<CircleDollarSign size={14} />}
              label="Kênh bán"
              value={
                sale.salesChannel ? salesChannelLabel(sale.salesChannel) : "—"
              }
            />
          </div>
          {sale.notes && (
            <p className="mt-4 rounded-xl bg-panel p-3 text-xs text-secondary">
              {sale.notes}
            </p>
          )}
        </section>

        <section className="mt-4 rounded-3xl border border-app-border bg-surface p-5">
          <h2 className="text-sm font-black text-primary">Mục đã bán</h2>
          <div className="mt-3 space-y-2">
            {sale.items.map((item) => {
              const card = item.inventoryItem.card;
              const image =
                item.inventoryItem.imageUrl ?? card.referenceImage;
              const isRefunded = Boolean(item.refundedAt);
              return (
                <Link
                  key={item.id}
                  href={`/the/${card.id}`}
                  className={`flex items-center gap-3 rounded-xl border border-app-border bg-panel p-3 transition hover:border-violet-400/50 ${
                    isRefunded ? "opacity-70" : ""
                  }`}
                >
                  <div className="grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface">
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-xs font-black text-primary">
                        {card.name}
                      </p>
                      {isRefunded && (
                        <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[8px] font-black text-slate-600">
                          Đã hoàn
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {[
                        card.category?.parent?.name,
                        card.category?.name,
                        item.inventoryItem.condition,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xs font-black ${
                        isRefunded
                          ? "text-muted line-through"
                          : "text-primary"
                      }`}
                    >
                      {formatVnd(item.soldPrice)}
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted">
                      vốn {formatVnd(item.costPrice)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {sale.expenses.length > 0 && (
          <section className="mt-4 rounded-3xl border border-app-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <ReceiptText size={16} className="text-accent-text" />
              <h2 className="text-sm font-black text-primary">Chi phí</h2>
            </div>
            <div className="mt-3 space-y-2">
              {sale.expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center justify-between rounded-xl border border-app-border bg-panel px-3 py-2.5"
                >
                  <p className="text-xs text-secondary">
                    {expense.label || expense.type}
                    {expense.type === "REFUND" ? " · Hoàn đơn" : ""}
                  </p>
                  <p className="text-xs font-black text-primary">
                    {formatVnd(expense.amount)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {sale.refunds.length > 0 && (
          <section className="mt-4 rounded-3xl border border-app-border bg-surface p-5">
            <h2 className="text-sm font-black text-primary">
              Lịch sử hoàn ({sale.refunds.length})
            </h2>
            <div className="mt-3 space-y-2">
              {sale.refunds.map((refund) => (
                <div
                  key={refund.id}
                  className="rounded-xl border border-app-border bg-panel px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold text-primary">
                      {refund.createdAt.toLocaleString("vi-VN")}
                    </p>
                    <p className="text-xs font-black text-slate-600">
                      Trả khách {formatVnd(refund.refundedAmount)}
                    </p>
                  </div>
                  {refund.notes && (
                    <p className="mt-1 text-[10px] text-muted">{refund.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {sale.payments.length > 0 ? (
          <section className="mt-4 rounded-3xl border border-app-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <CircleDollarSign size={16} className="text-emerald-600" />
              <h2 className="text-sm font-black text-primary">
                Lịch sử thanh toán ({sale.payments.length})
              </h2>
            </div>
            <div className="mt-3 space-y-2">
              {sale.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-xl border border-app-border bg-panel px-3 py-2.5"
                >
                  <div>
                    <p className="text-xs font-bold text-primary">
                      {
                        {
                          CASH: "Tiền mặt",
                          BANK_TRANSFER: "Chuyển khoản",
                          EWALLET: "Ví điện tử",
                          OTHER: "Khác",
                        }[payment.method]
                      }
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted">
                      {payment.paidAt.toLocaleDateString("vi-VN")}
                      {payment.notes ? ` · ${payment.notes}` : ""}
                    </p>
                  </div>
                  <p
                    className={`text-xs font-black ${
                      payment.direction === "CUSTOMER_TO_US"
                        ? "text-emerald-600"
                        : "text-rose-500"
                    }`}
                  >
                    {payment.direction === "CUSTOMER_TO_US" ? "+" : "−"}
                    {formatVnd(payment.amount)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          sale.customerId &&
          sale.status !== "CANCELLED" &&
          sale.status !== "REFUNDED" && (
            <section className="mt-4 rounded-3xl border border-dashed border-app-border bg-surface p-5 text-center">
              <p className="text-xs text-muted">
                Chưa có lần thanh toán nào gắn với đơn này.
              </p>
            </section>
          )
        )}
      </main>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="rounded-xl border border-app-border bg-panel p-3">
      <p className="text-[9px] text-muted">{label}</p>
      <p
        className={`mt-1 truncate text-sm font-black ${
          tone === "positive"
            ? "text-emerald-600"
            : tone === "negative"
              ? "text-rose-500"
              : "text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-app-border bg-panel px-3 py-2.5">
      <span className="text-accent-text">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] text-muted">{label}</p>
        <p className="truncate text-xs font-bold text-primary">{value}</p>
      </div>
    </div>
  );
}

function signedVnd(value: number) {
  if (value === 0) return formatVnd(0);
  return `${value > 0 ? "+" : "−"}${formatVnd(Math.abs(value))}`;
}
