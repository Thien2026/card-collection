"use client";

import Link from "next/link";
import { useTransition } from "react";
import {
  CheckCircle2,
  Eye,
  Trash2,
  XCircle,
} from "lucide-react";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { cancelSale, completeSale, deleteSale } from "./actions";

export function SaleRowActions({
  saleId,
  code,
  status,
}: {
  saleId: string;
  code: string;
  status: "DRAFT" | "COMPLETED" | "CANCELLED" | "REFUNDED";
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  async function onComplete() {
    const ok = await confirm({
      title: "Hoàn tất giao dịch?",
      description: `Xác nhận hoàn tất đơn “${code}”. Các mục trong đơn sẽ chuyển sang trạng thái đã bán.`,
      confirmLabel: "Hoàn tất",
      cancelLabel: "Huỷ",
      tone: "default",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        toast.loading("Đang hoàn tất…", { id: saleId });
        await completeSale(saleId);
        toast.success(`Đã hoàn tất ${code}`, { id: saleId });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Không thể hoàn tất.",
          { id: saleId },
        );
      }
    });
  }

  async function onCancel() {
    const ok = await confirm({
      title: "Huỷ đơn nháp?",
      description: `Huỷ đơn “${code}”. Các mục đang giữ sẽ được trả lại kho.`,
      confirmLabel: "Huỷ đơn",
      cancelLabel: "Giữ lại",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        toast.loading("Đang huỷ đơn…", { id: saleId });
        await cancelSale(saleId);
        toast.success(`Đã huỷ ${code}`, { id: saleId });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Không thể huỷ đơn.",
          { id: saleId },
        );
      }
    });
  }

  async function onDelete() {
    const ok = await confirm({
      title: "Xoá giao dịch?",
      description: `Xoá đơn “${code}”. Thao tác này không thể hoàn tác.`,
      confirmLabel: "Xoá",
      cancelLabel: "Huỷ",
      tone: "danger",
      confirmText: code,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        toast.loading("Đang xoá…", { id: saleId });
        await deleteSale(saleId);
        toast.success(`Đã xoá ${code}`, { id: saleId });
      } catch (error) {
        if (isRedirectError(error)) {
          toast.success(`Đã xoá ${code}`, { id: saleId });
          throw error;
        }
        toast.error(
          error instanceof Error ? error.message : "Không thể xoá đơn.",
          { id: saleId },
        );
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link
        href={`/ban-hang/${saleId}`}
        className="inline-flex items-center gap-1 rounded-lg border border-app-border bg-panel px-2.5 py-1.5 text-[10px] font-bold text-secondary transition hover:border-violet-400/50 hover:text-primary"
      >
        <Eye size={12} />
        Chi tiết
      </Link>
      {status === "DRAFT" && (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => void onComplete()}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-[10px] font-bold text-emerald-600 transition hover:bg-emerald-500/25 disabled:opacity-50"
          >
            <CheckCircle2 size={12} />
            Hoàn tất
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void onCancel()}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-bold text-rose-500 transition hover:bg-rose-500/20 disabled:opacity-50"
          >
            <XCircle size={12} />
            Huỷ
          </button>
        </>
      )}
      {status === "CANCELLED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void onDelete()}
          className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-bold text-rose-500 transition hover:bg-rose-500/20 disabled:opacity-50"
        >
          <Trash2 size={12} />
          Xoá
        </button>
      )}
    </div>
  );
}
