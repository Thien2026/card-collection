"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { deleteCollection, deleteSeries } from "./category-actions";

export function DeleteCategoryButton({
  id,
  collectionId,
  name,
  kind,
  hasContents = false,
}: {
  id: string;
  collectionId?: string;
  name: string;
  kind: "collection" | "series";
  /** true nếu còn series/thẻ bên trong — dùng để cảnh báo cascade */
  hasContents?: boolean;
}) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      )
        setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function closeMenu() {
      setOpen(false);
    }
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [open]);

  async function remove() {
    setOpen(false);
    const label = kind === "collection" ? "bộ sưu tập" : "series";
    const cascadeWarning = hasContents
      ? kind === "collection"
        ? `\n\nCẢNH BÁO: Bộ sưu tập này còn series/thẻ bên trong.\nXoá sẽ XOÁ CASCADE toàn bộ series, thẻ, ảnh và lịch sử giao dịch liên quan.\nThao tác này KHÔNG THỂ hoàn tác.`
        : `\n\nCẢNH BÁO: Series này còn thẻ bên trong.\nXoá sẽ XOÁ CASCADE toàn bộ thẻ, ảnh và lịch sử giao dịch liên quan.\nThao tác này KHÔNG THỂ hoàn tác.`
      : `\n\nThao tác này không thể hoàn tác.`;

    const ok = await confirm({
      title: `Xoá ${label} “${name}”?`,
      description: `Bạn sắp xoá ${label} này.${cascadeWarning}`,
      confirmLabel: hasContents ? "Xoá vĩnh viễn" : "Xoá",
      cancelLabel: "Huỷ",
      tone: "danger",
      confirmText: name,
    });
    if (!ok) return;

    startTransition(async () => {
      const toastId = `delete-${kind}-${id}`;
      try {
        toast.loading(`Đang xoá ${label}…`, { id: toastId });
        if (kind === "collection") await deleteCollection(id);
        else await deleteSeries(id, collectionId!);
        toast.success(
          kind === "collection"
            ? `Đã xoá bộ sưu tập “${name}”`
            : `Đã xoá series “${name}”`,
          { id: toastId },
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Không thể xoá. Thử lại sau.",
          { id: toastId },
        );
      }
    });
  }

  return (
    <div className="absolute right-2 top-2 z-10">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-label={`Tùy chọn ${name}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) {
            const menuWidth = 128;
            const viewportPadding = 8;
            const preferredLeft = rect.right - menuWidth;
            const left = Math.min(
              window.innerWidth - menuWidth - viewportPadding,
              Math.max(viewportPadding, preferredLeft),
            );
            setPosition({ top: rect.bottom + 6, left });
          }
          setOpen((value) => !value);
        }}
        className="rounded-full bg-black/45 p-1.5 text-on-media backdrop-blur"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          ref={menuRef}
          className="fixed z-[70] w-32 rounded-lg border border-app-border bg-surface-raised p-1 shadow-xl"
          style={position}
        >
          <button
            type="button"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void remove();
            }}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-bold text-rose-500 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:text-muted"
          >
            <Trash2 size={13} />
            {pending ? "Đang xoá..." : "Xoá"}
          </button>
        </div>
      )}
    </div>
  );
}
