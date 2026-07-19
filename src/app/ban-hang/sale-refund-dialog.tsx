"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";
import { refundSale } from "./actions";

type RefundItem = {
  id: string;
  name: string;
  soldPrice: number;
  meta: string;
};

/** Gợi ý tiền trả: không vượt quá số đã thu, tỷ lệ theo giá trị hàng hoàn. */
function suggestedRefundAmount(
  selectedTotal: number,
  orderBill: number,
  orderPaid: number,
) {
  if (selectedTotal <= 0) return 0;
  if (orderPaid <= 0) return 0;
  if (orderPaid >= orderBill) return selectedTotal;
  if (orderBill <= 0) return 0;
  return Math.min(
    selectedTotal,
    Math.round((orderPaid * selectedTotal) / orderBill),
  );
}

export function SaleRefundDialog({
  saleId,
  saleCode,
  hasCustomer,
  customerId,
  customerName,
  customerBalance,
  orderBill,
  orderPaid,
  items,
}: {
  saleId: string;
  saleCode: string;
  hasCustomer: boolean;
  customerId?: string | null;
  customerName?: string | null;
  /** Dương = khách nợ mình; âm = mình nợ khách */
  customerBalance?: number | null;
  orderBill: number;
  orderPaid: number;
  items: RefundItem[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((item) => [item.id, true])),
  );
  const [refundAmount, setRefundAmount] = useState(0);
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [expenseLabel, setExpenseLabel] = useState("Chi phí hoàn đơn");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");

  const selectedItems = useMemo(
    () => items.filter((item) => selected[item.id]),
    [items, selected],
  );
  const selectedTotal = selectedItems.reduce(
    (sum, item) => sum + item.soldPrice,
    0,
  );
  const suggested = suggestedRefundAmount(
    selectedTotal,
    orderBill,
    orderPaid,
  );
  const orderRemaining = orderBill - orderPaid;
  const debtCleared = selectedTotal;
  const afterOrderRemaining = Math.max(0, orderBill - selectedTotal - orderPaid);

  function applySuggested(total = selectedTotal) {
    setRefundAmount(suggestedRefundAmount(total, orderBill, orderPaid));
  }

  function openDialog() {
    const initialSelected = Object.fromEntries(
      items.map((item) => [item.id, true]),
    );
    const total = items.reduce((sum, item) => sum + item.soldPrice, 0);
    setSelected(initialSelected);
    setRefundAmount(suggestedRefundAmount(total, orderBill, orderPaid));
    setExpenseAmount(0);
    setExpenseLabel("Chi phí hoàn đơn");
    setNotes("");
    setPaymentMethod("BANK_TRANSFER");
    setOpen(true);
  }

  function toggleAll(checked: boolean) {
    setSelected(Object.fromEntries(items.map((item) => [item.id, checked])));
    const total = checked
      ? items.reduce((sum, item) => sum + item.soldPrice, 0)
      : 0;
    setRefundAmount(suggestedRefundAmount(total, orderBill, orderPaid));
  }

  function toggleItem(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev, [id]: checked };
      const total = items
        .filter((item) => next[item.id])
        .reduce((sum, item) => sum + item.soldPrice, 0);
      setRefundAmount(suggestedRefundAmount(total, orderBill, orderPaid));
      return next;
    });
  }

  function submit(formData: FormData) {
    if (!selectedItems.length) {
      toast.error("Chọn ít nhất một mục để hoàn.");
      return;
    }
    startTransition(async () => {
      try {
        for (const item of selectedItems) {
          formData.append("saleItemId", item.id);
        }
        formData.set("refundAmount", String(refundAmount));
        formData.set("expenseAmount", String(expenseAmount));
        formData.set("expenseLabel", expenseLabel);
        formData.set("paymentMethod", paymentMethod);
        if (notes.trim()) formData.set("notes", notes.trim());
        await refundSale(saleId, formData);
        setOpen(false);
        toast.success(
          selectedItems.length === items.length
            ? `Đã hoàn toàn bộ ${saleCode}`
            : `Đã hoàn ${selectedItems.length} mục trong ${saleCode}`,
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Không thể hoàn đơn.",
        );
      }
    });
  }

  if (!items.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-black text-rose-600 transition hover:bg-rose-500/15"
      >
        <RotateCcw size={16} />
        Hoàn đơn
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
            method="post"
            action={submit}
            className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-app-border bg-surface p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-primary">Hoàn đơn</h2>
                <p className="mt-1 text-[10px] text-muted">
                  {saleCode} · Chọn toàn bộ hoặc một phần mục để trả về kho
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-panel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">
                Công nợ đơn này
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[9px] text-muted">Bill còn lại</p>
                  <p className="mt-0.5 text-xs font-black text-primary">
                    {formatVnd(orderBill)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted">Đã thu</p>
                  <p className="mt-0.5 text-xs font-black text-emerald-600">
                    {formatVnd(orderPaid)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted">
                    {orderRemaining > 0
                      ? "Khách còn nợ"
                      : orderRemaining < 0
                        ? "Thừa / mình nợ"
                        : "Đối soát"}
                  </p>
                  <p
                    className={`mt-0.5 text-xs font-black ${
                      orderRemaining > 0
                        ? "text-amber-700"
                        : orderRemaining < 0
                          ? "text-sky-600"
                          : "text-primary"
                    }`}
                  >
                    {formatVnd(Math.abs(orderRemaining))}
                  </p>
                </div>
              </div>
              {hasCustomer && typeof customerBalance === "number" && (
                <p className="mt-2 text-[10px] leading-4 text-amber-900/80">
                  Sổ khách{" "}
                  {customerId ? (
                    <Link
                      href={`/ban-hang/khach-hang/${customerId}`}
                      className="font-bold text-accent underline"
                    >
                      {customerName || "Khách"}
                    </Link>
                  ) : (
                    <span className="font-bold">{customerName || "Khách"}</span>
                  )}
                  :{" "}
                  {customerBalance > 0
                    ? `đang nợ mình ${formatVnd(customerBalance)}`
                    : customerBalance < 0
                      ? `mình đang nợ ${formatVnd(-customerBalance)}`
                      : "đã cân"}{" "}
                  (mọi đơn).
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold text-secondary">
                Mục hoàn ({selectedItems.length}/{items.length})
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleAll(true)}
                  className="text-[10px] font-bold text-accent"
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => toggleAll(false)}
                  className="text-[10px] font-bold text-muted"
                >
                  Bỏ chọn
                </button>
              </div>
            </div>

            <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
              {items.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-app-border bg-panel px-3 py-2.5"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selected[item.id])}
                    onChange={(event) =>
                      toggleItem(item.id, event.target.checked)
                    }
                    className="accent-violet-600"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-primary">
                      {item.name}
                    </p>
                    <p className="truncate text-[9px] text-muted">{item.meta}</p>
                  </div>
                  <p className="shrink-0 text-xs font-black text-primary">
                    {formatVnd(item.soldPrice)}
                  </p>
                </label>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-app-border bg-panel px-3 py-2.5 text-[10px] leading-4 text-secondary">
              <p>
                Giá trị hàng chọn:{" "}
                <span className="font-black text-primary">
                  {formatVnd(selectedTotal)}
                </span>
                {" · "}
                Phần nợ bill sẽ giảm tương ứng khi hoàn hàng
                {debtCleared > 0 ? ` (−${formatVnd(debtCleared)})` : ""}.
              </p>
              {orderPaid > 0 && orderPaid < orderBill && (
                <p className="mt-1 text-amber-800">
                  Khách mới trả {formatVnd(orderPaid)}/{formatVnd(orderBill)}.
                  Gợi ý trả lại{" "}
                  <span className="font-black">{formatVnd(suggested)}</span>{" "}
                  (tỷ lệ theo hàng hoàn), không mặc định trả đủ giá trị hàng.
                </p>
              )}
              {orderPaid <= 0 && selectedTotal > 0 && (
                <p className="mt-1 text-amber-800">
                  Đơn chưa thu tiền: gợi ý trả khách = 0đ. Hoàn hàng chỉ xoá
                  công nợ bill, không cần chuyển tiền.
                </p>
              )}
              {afterOrderRemaining > 0 &&
                selectedTotal < orderBill &&
                orderRemaining > 0 && (
                  <p className="mt-1 text-muted">
                    Sau khi hoàn, ước tính còn nợ trên phần hàng giữ lại (nếu
                    không chỉnh thanh toán): xem lại sổ khách.
                  </p>
                )}
            </div>

            <label className="mt-4 block">
              <span className="text-[10px] font-bold text-secondary">
                Tiền trả khách
              </span>
              <input
                value={formatVndInput(refundAmount)}
                onChange={(event) =>
                  setRefundAmount(parseVndInput(event.target.value))
                }
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm font-bold text-primary outline-none focus:border-violet-400"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applySuggested()}
                className="rounded-lg border border-app-border bg-panel px-2.5 py-1.5 text-[10px] font-bold text-secondary"
              >
                Gợi ý: {formatVnd(suggested)}
              </button>
              <button
                type="button"
                onClick={() => setRefundAmount(selectedTotal)}
                className="rounded-lg border border-app-border bg-panel px-2.5 py-1.5 text-[10px] font-bold text-secondary"
              >
                Đủ giá trị hàng: {formatVnd(selectedTotal)}
              </button>
              {orderPaid > 0 && (
                <button
                  type="button"
                  onClick={() => setRefundAmount(Math.min(selectedTotal, orderPaid))}
                  className="rounded-lg border border-app-border bg-panel px-2.5 py-1.5 text-[10px] font-bold text-secondary"
                >
                  Tối đa đã thu: {formatVnd(Math.min(selectedTotal, orderPaid))}
                </button>
              )}
              <button
                type="button"
                onClick={() => setRefundAmount(0)}
                className="rounded-lg border border-app-border bg-panel px-2.5 py-1.5 text-[10px] font-bold text-muted"
              >
                0đ (chỉ hoàn kho)
              </button>
            </div>

            {hasCustomer ? (
              <label className="mt-3 block">
                <span className="text-[10px] font-bold text-secondary">
                  Phương thức trả
                </span>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-xs text-primary outline-none focus:border-violet-400"
                >
                  <option value="BANK_TRANSFER">Chuyển khoản</option>
                  <option value="CASH">Tiền mặt</option>
                  <option value="EWALLET">Ví điện tử</option>
                  <option value="OTHER">Khác</option>
                </select>
              </label>
            ) : (
              <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-[10px] text-amber-700">
                Đơn khách lẻ: hoàn kho và chi phí vẫn ghi nhận; không tạo phiếu
                trả tiền trên sổ khách (gắn khách nếu cần theo dõi công nợ).
              </p>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[10px] font-bold text-secondary">
                  Chi phí hoàn (tuỳ chọn)
                </span>
                <input
                  value={formatVndInput(expenseAmount)}
                  onChange={(event) =>
                    setExpenseAmount(parseVndInput(event.target.value))
                  }
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-secondary">
                  Nhãn chi phí
                </span>
                <input
                  value={expenseLabel}
                  onChange={(event) => setExpenseLabel(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-xs text-primary outline-none focus:border-violet-400"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="text-[10px] font-bold text-secondary">
                Ghi chú
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-xs text-primary outline-none focus:border-violet-400"
                placeholder="Lý do hoàn, tình trạng hàng…"
              />
            </label>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-app-border px-4 py-3 text-xs font-bold text-secondary"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={pending || !selectedItems.length}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
              >
                {pending ? "Đang hoàn…" : "Xác nhận hoàn"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
