"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, X } from "lucide-react";
import { toast } from "sonner";
import { formatVnd } from "@/lib/format";
import { recordSalePayment } from "./actions";

export function SalePaymentDialog({
  saleId,
  customerId,
  customerName,
  remaining,
}: {
  saleId: string;
  customerId: string;
  customerName: string;
  remaining: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        await recordSalePayment(saleId, formData);
        setOpen(false);
        router.refresh();
        toast.success("Đã ghi nhận thanh toán cho đơn");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Không thể ghi nhận thanh toán.",
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-xs font-black text-white shadow-lg shadow-emerald-950/20"
      >
        <Banknote size={16} />
        Thêm thanh toán
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
          />
          <form
            action={submit}
            className="relative z-10 w-full max-w-md rounded-2xl border border-app-border bg-surface p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-primary">
                  Thanh toán thêm
                </h2>
                <p className="mt-1 text-[10px] text-muted">
                  {customerName} · Còn{" "}
                  <span className="font-bold text-primary">
                    {formatVnd(remaining)}
                  </span>
                </p>
                <p className="mt-2 text-[10px] leading-4 text-secondary">
                  Thanh toán nhiều lần = trả từng phần. Ví dụ bill 1.000.000₫
                  trả 300.000₫ hôm nay, còn lại trả sau.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-panel text-muted"
              >
                <X size={17} />
              </button>
            </div>

            <input type="hidden" name="customerId" value={customerId} />

            <label className="mt-5 block">
              <span className="text-[10px] font-bold text-muted">
                Loại thanh toán
              </span>
              <select
                name="direction"
                defaultValue={
                  remaining < 0 ? "US_TO_CUSTOMER" : "CUSTOMER_TO_US"
                }
                className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm font-bold text-primary outline-none focus:border-violet-400"
              >
                <option value="CUSTOMER_TO_US">Khách thanh toán cho mình</option>
                <option value="US_TO_CUSTOMER">Mình trả / hoàn cho khách</option>
              </select>
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label>
                <span className="text-[10px] font-bold text-muted">
                  Số tiền (₫) *
                </span>
                <input
                  name="amount"
                  type="number"
                  min={1}
                  required
                  defaultValue={Math.abs(remaining) || undefined}
                  placeholder="0"
                  className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm font-black text-primary outline-none focus:border-violet-400"
                />
              </label>
              <label>
                <span className="text-[10px] font-bold text-muted">
                  Phương thức
                </span>
                <select
                  name="method"
                  defaultValue="BANK_TRANSFER"
                  className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
                >
                  <option value="BANK_TRANSFER">Chuyển khoản</option>
                  <option value="CASH">Tiền mặt</option>
                  <option value="EWALLET">Ví điện tử</option>
                  <option value="OTHER">Khác</option>
                </select>
              </label>
            </div>

            <label className="mt-3 block">
              <span className="text-[10px] font-bold text-muted">
                Ngày thanh toán
              </span>
              <input
                name="paidAt"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-[10px] font-bold text-muted">Ghi chú</span>
              <input
                name="notes"
                placeholder="VD: trả đợt 2"
                className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
              />
            </label>

            <button
              type="submit"
              disabled={pending}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {pending ? "Đang lưu…" : "Ghi nhận"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
