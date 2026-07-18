"use client";

import { Heart } from "lucide-react";
import { useState, useTransition } from "react";
import { toggleCardFavorite, toggleCategoryFavorite } from "@/app/actions";
import type { FavoriteSource } from "@/lib/favorites";

type FavoriteButtonProps = {
  id: string;
  type: "card" | "category";
  initial?: boolean;
  source?: FavoriteSource;
  compact?: boolean;
  className?: string;
  label?: string;
};

export function FavoriteButton({
  id,
  type,
  initial = false,
  source,
  compact = false,
  className = "",
  label,
}: FavoriteButtonProps) {
  const [state, setState] = useState<FavoriteSource>(
    source ?? (initial ? "explicit" : "none"),
  );
  const [pending, startTransition] = useTransition();
  const on = state !== "none";
  const title =
    label ??
    (type === "category"
      ? on
        ? "Bỏ yêu thích toàn bộ card"
        : "Yêu thích toàn bộ card"
      : state === "inherited"
        ? "Yêu thích từ bộ sưu tập — nhấn để lưu yêu thích riêng"
        : state === "explicit"
          ? "Bỏ yêu thích riêng"
          : "Thêm yêu thích riêng");

  function toggle() {
    if (pending) return;
    const previous = state;
    const optimistic: FavoriteSource =
      type === "card"
        ? state === "explicit"
          ? "none"
          : "explicit"
        : on
          ? "none"
          : "explicit";
    setState(optimistic);
    startTransition(async () => {
      try {
        const result =
          type === "card"
            ? await toggleCardFavorite(id)
            : await toggleCategoryFavorite(id);
        setState(result.source);
      } catch (error) {
        setState(previous);
        console.error("Không thể cập nhật yêu thích", error);
      }
    });
  }

  return (
    <button
      type="button"
      title={title}
      disabled={pending}
      aria-busy={pending}
      aria-pressed={on}
      aria-label={title}
      onClick={toggle}
      className={`grid shrink-0 place-items-center rounded-full border border-white/25 bg-surface/90 shadow-lg backdrop-blur transition ${compact ? "h-8 w-8" : "h-9 w-9"} ${on ? (state === "inherited" ? "text-violet-500" : "text-rose-500") : "text-muted"} ${pending ? "cursor-wait opacity-70" : "hover:scale-105"} ${className}`}
    >
      <Heart size={compact ? 15 : 17} fill={on ? "currentColor" : "none"} />
    </button>
  );
}
