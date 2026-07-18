"use client";

import { useActionState, useEffect } from "react";
import { Eraser, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import {
  clearUserTmpAction,
  deleteUploadPathAction,
  type FileActionState,
} from "./actions";

const initial: FileActionState = { status: "idle", message: "" };

export function DeletePathButton({
  userId,
  relativePath,
  label,
  kind,
}: {
  userId: string;
  relativePath: string;
  label: string;
  kind: "file" | "directory";
}) {
  const confirm = useConfirm();
  const [state, action] = useActionState(deleteUploadPathAction, initial);

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <form
      action={async (formData) => {
        const ok = await confirm({
          title: kind === "directory" ? "Xoá thư mục?" : "Xoá file?",
          description:
            kind === "directory"
              ? `Xoá toàn bộ nội dung trong “${label}”. Thao tác không hoàn tác. Ảnh trong DB có thể bị gãy nếu đang trỏ vào đây.`
              : `Xoá file “${label}”. Thao tác không hoàn tác.`,
          confirmLabel: "Xoá",
          tone: "danger",
          confirmText: label,
          confirmTextLabel: (
            <>
              Gõ <span className="font-bold text-primary">{label}</span> để xác
              nhận
            </>
          ),
        });
        if (ok) action(formData);
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="relativePath" value={relativePath} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/12 px-2.5 py-2 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20"
      >
        <Trash2 size={13} />
        Xoá
      </button>
    </form>
  );
}

export function ClearTmpButton({ userId }: { userId: string }) {
  const confirm = useConfirm();
  const [state, action] = useActionState(clearUserTmpAction, initial);

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <form
      action={async (formData) => {
        const ok = await confirm({
          title: "Dọn file tạm?",
          description:
            "Xoá toàn bộ thư mục tmp của user này. Thường an toàn vì chỉ chứa ảnh upload chưa lưu.",
          confirmLabel: "Dọn tmp",
          tone: "danger",
        });
        if (ok) action(formData);
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-xl border border-app-border bg-panel px-3 py-2 text-[10px] font-bold text-secondary hover:bg-accent-soft hover:text-accent-text"
      >
        <Eraser size={13} />
        Dọn tmp
      </button>
    </form>
  );
}
