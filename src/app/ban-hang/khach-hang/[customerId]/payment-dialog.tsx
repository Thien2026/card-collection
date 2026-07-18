"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, X } from "lucide-react";
import { toast } from "sonner";
import { recordCustomerPayment } from "../actions";

export function PaymentDialog({
  customerId,
  customerName,
  balance,
}: {
  customerId: string;
  customerName: string;
  balance: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        await recordCustomerPayment(customerId, formData);
        setOpen(false);
        router.refresh();
        toast.success("Đã ghi nhận thanh toán");
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
        Thanh toán
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
                  Ghi nhận thanh toán
                </h2>
                <p className="mt-1 text-[10px] text-muted">{customerName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-panel text-muted"
              >
                <X size={17} />
              </button>
            </div>

            <label className="mt-5 block">
              <span className="text-[10px] font-bold text-muted">
                Loại thanh toán
              </span>
              <select
                name="direction"
                defaultValue={
                  balance < 0 ? "US_TO_CUSTOMER" : "CUSTOMER_TO_US"
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
                  defaultValue={Math.abs(balance) || undefined}
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
              <textarea
                name="notes"
                rows={2}
                placeholder="Mã giao dịch, nội dung chuyển khoản..."
                className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-app-border bg-panel px-4 py-2.5 text-xs font-black text-secondary"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
              >
                {pending ? "Đang lưu…" : "Ghi nhận"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
