"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { deleteCard } from "./actions";

export function DeleteCardButton({
  cardId,
  name,
  saleCount,
}: {
  cardId: string;
  name: string;
  saleCount: number;
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  async function onDelete() {
    const historyWarning =
      saleCount > 0
        ? `\n\nThẻ này có ${saleCount} giao dịch bán liên quan. Toàn bộ lịch sử giao dịch đó cũng sẽ bị xoá vĩnh viễn.`
        : "\n\nNếu thẻ đã từng bán, lịch sử giao dịch liên quan cũng sẽ bị xoá.";

    const ok = await confirm({
      title: "Xoá thẻ này?",
      description: `Bạn sắp xoá “${name}”.${historyWarning}\n\nThao tác này không thể hoàn tác.`,
      confirmLabel: "Xoá thẻ",
      cancelLabel: "Huỷ",
      tone: "danger",
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        toast.loading("Đang xoá thẻ…", { id: `delete-card-${cardId}` });
        await deleteCard(cardId);
        toast.success(`Đã xoá “${name}”`, { id: `delete-card-${cardId}` });
      } catch (error) {
        if (isRedirectError(error)) {
          toast.success(`Đã xoá “${name}”`, { id: `delete-card-${cardId}` });
          throw error;
        }
        toast.error(
          error instanceof Error ? error.message : "Không thể xoá thẻ.",
          { id: `delete-card-${cardId}` },
        );
      }
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void onDelete()}
      aria-label="Xoá thẻ"
      title="Xoá thẻ"
      className="grid h-10 w-10 place-items-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-500 transition hover:bg-rose-500/20 disabled:opacity-60 sm:h-11 sm:w-11"
    >
      <Trash2 size={17} />
    </button>
  );
}
