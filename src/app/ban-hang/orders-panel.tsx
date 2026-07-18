"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  FilePenLine,
  ShoppingBag,
} from "lucide-react";
import { formatVnd } from "@/lib/format";
import { salesChannelLabel } from "@/lib/sales-channels";
import { SaleRowActions } from "./sale-row-actions";

export type OrderRow = {
  id: string;
  code: string;
  status: "DRAFT" | "COMPLETED" | "CANCELLED" | "REFUNDED";
  partiallyRefunded?: boolean;
  customerName: string | null;
  salesChannel: string | null;
  revenue: number;
  paid: number;
  profit: number;
  itemsCount: number;
  dateLabel: string;
  previewImage: string | null;
};

const statusCopy = {
  DRAFT: { label: "Nháp", className: "bg-amber-500/12 text-amber-600" },
  COMPLETED: {
    label: "Hoàn tất",
    className: "bg-emerald-500/12 text-emerald-600",
  },
  CANCELLED: { label: "Đã huỷ", className: "bg-rose-500/12 text-rose-600" },
  REFUNDED: { label: "Đã hoàn", className: "bg-slate-500/15 text-slate-600" },
} as const;

export function OrdersPanel({ sales }: { sales: OrderRow[] }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const selectedSales = useMemo(
    () => sales.filter((sale) => selected[sale.id]),
    [sales, selected],
  );

  const totals = useMemo(() => {
    const bill = selectedSales.reduce((sum, sale) => sum + sale.revenue, 0);
    const paid = selectedSales.reduce((sum, sale) => sum + sale.paid, 0);
    return {
      count: selectedSales.length,
      bill,
      paid,
      remaining: bill - paid,
    };
  }, [selectedSales]);

  function toggle(id: string) {
    setSelected((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleAll() {
    const allSelected =
      sales.length > 0 && sales.every((sale) => selected[sale.id]);
    if (allSelected) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const sale of sales) next[sale.id] = true;
    setSelected(next);
  }

  if (sales.length === 0) return null;

  const allSelected = sales.every((sale) => selected[sale.id]);

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleAll}
          className="inline-flex items-center gap-2 rounded-lg border border-app-border bg-panel px-2.5 py-1.5 text-[10px] font-bold text-secondary"
        >
          <span
            className={`grid h-4 w-4 place-items-center rounded border ${
              allSelected
                ? "border-violet-500 bg-violet-500 text-white"
                : "border-app-border bg-surface"
            }`}
          >
            {allSelected ? <Check size={11} strokeWidth={3} /> : null}
          </span>
          {allSelected ? "Bỏ chọn trang này" : "Chọn cả trang"}
        </button>
        {totals.count > 0 && (
          <p className="text-[10px] font-bold text-accent-text">
            Đã chọn {totals.count} đơn
          </p>
        )}
      </div>

      <div className="space-y-3">
        {sales.map((sale) => {
          const statusInfo = sale.partiallyRefunded
            ? {
                label: "Hoàn một phần",
                className: "bg-amber-500/12 text-amber-700",
              }
            : statusCopy[sale.status];
          const remaining = sale.revenue - sale.paid;
          const active = Boolean(selected[sale.id]);
          return (
            <article
              key={sale.id}
              className={`rounded-2xl border bg-surface p-4 transition ${
                active
                  ? "border-violet-400/70 bg-accent-soft/40"
                  : "border-app-border hover:border-violet-400/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggle(sale.id)}
                  aria-label={active ? "Bỏ chọn" : "Chọn đơn"}
                  className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                    active
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-app-border bg-panel"
                  }`}
                >
                  {active ? <Check size={12} strokeWidth={3} /> : null}
                </button>
                <Link
                  href={`/ban-hang/${sale.id}`}
                  className="grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-panel"
                >
                  {sale.previewImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sale.previewImage}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ShoppingBag size={18} className="text-accent-text" />
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/ban-hang/${sale.id}`}
                          className="truncate text-xs font-black text-primary hover:text-accent-text"
                        >
                          {sale.code}
                        </Link>
                        <span
                          className={`rounded-full px-2 py-1 text-[8px] font-black ${statusInfo.className}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-muted">
                        {sale.customerName || "Khách lẻ"}
                        {sale.salesChannel
                          ? ` · ${salesChannelLabel(sale.salesChannel)}`
                          : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black text-primary">
                        {formatVnd(sale.revenue)}
                      </p>
                      <p className="mt-0.5 text-[9px] text-muted">
                        Đã trả {formatVnd(sale.paid)}
                      </p>
                      {sale.status !== "CANCELLED" &&
                        sale.status !== "REFUNDED" &&
                        remaining !== 0 && (
                        <p
                          className={`mt-0.5 text-[9px] font-bold ${
                            remaining > 0 ? "text-amber-600" : "text-sky-600"
                          }`}
                        >
                          {remaining > 0
                            ? `Còn ${formatVnd(remaining)}`
                            : `Thừa ${formatVnd(-remaining)}`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-app-border pt-3">
                    <div className="flex items-center gap-3 text-[9px] text-muted">
                      <span className="flex items-center gap-1">
                        <CalendarDays size={12} />
                        {sale.dateLabel}
                      </span>
                      <span className="flex items-center gap-1">
                        <FilePenLine size={12} />
                        {sale.itemsCount} mục
                      </span>
                      {sale.status === "COMPLETED" && (
                        <span
                          className={`font-black ${
                            sale.profit < 0
                              ? "text-rose-500"
                              : "text-emerald-600"
                          }`}
                        >
                          {signedVnd(sale.profit)}
                        </span>
                      )}
                    </div>
                    <SaleRowActions
                      saleId={sale.id}
                      code={sale.code}
                      status={sale.status}
                    />
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {totals.count > 0 && (
        <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mt-4 rounded-2xl border border-violet-400/40 bg-surface/95 p-4 shadow-xl shadow-violet-950/20 backdrop-blur lg:bottom-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-accent-text">
                Đã chọn {totals.count} giao dịch
              </p>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[9px] text-muted">Tổng bill</p>
                  <p className="text-sm font-black text-primary">
                    {formatVnd(totals.bill)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted">Đã thanh toán</p>
                  <p className="text-sm font-black text-emerald-600">
                    {formatVnd(totals.paid)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted">Còn lại</p>
                  <p
                    className={`text-sm font-black ${
                      totals.remaining > 0
                        ? "text-amber-600"
                        : totals.remaining < 0
                          ? "text-sky-600"
                          : "text-primary"
                    }`}
                  >
                    {formatVnd(totals.remaining)}
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelected({})}
              className="rounded-xl border border-app-border px-3 py-2 text-[10px] font-bold text-secondary"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function signedVnd(value: number) {
  if (value === 0) return formatVnd(0);
  return `${value > 0 ? "+" : "−"}${formatVnd(Math.abs(value))}`;
}
