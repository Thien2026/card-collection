"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { Camera, Edit3, LoaderCircle, Plus, Settings, X } from "lucide-react";
import { toast } from "sonner";
import {
  createCollection,
  createSeries,
  updateCategory,
} from "./category-actions";
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_HELP } from "@/lib/upload-image";
import { compressImageForUpload } from "@/lib/compress-image-client";

type Collection = { id: string; name: string };
export type CategoryValue = {
  id: string;
  name: string;
  parentId: string | null;
  coverImageUrl: string | null;
  bannerImageUrl: string | null;
  accentColor: string | null;
  description: string | null;
  releaseYear: number | null;
  targetItemCount: number | null;
};
type DialogProps = {
  collections: Collection[];
  initialMode?: "collection" | "series";
  parentId?: string;
  category?: CategoryValue;
  defaultOpen?: boolean;
  lockMode?: boolean;
  trigger?:
    | "add"
    | "edit"
    | "settings"
    | "menu"
    | "icon"
    | "header-icon"
    | "inline";
  onCreated?: (result: {
    id: string;
    mode: "collection" | "series";
  }) => void;
};

export function CategoryDialog({
  collections,
  initialMode = "collection",
  parentId,
  category,
  defaultOpen = false,
  lockMode = false,
  trigger = category ? "edit" : "add",
  onCreated,
}: DialogProps) {
  const editing = Boolean(category);
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"collection" | "series">(
    category?.parentId ? "series" : initialMode,
  );
  const [coverUrl, setCoverUrl] = useState(category?.coverImageUrl ?? "");
  const [coverToken, setCoverToken] = useState("");
  const [bannerUrl, setBannerUrl] = useState(category?.bannerImageUrl ?? "");
  const [bannerToken, setBannerToken] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = useCallback(() => {
    if (!pending) {
      setOpen(false);
      setError("");
    }
  }, [pending]);
  useEffect(() => {
    // The portal must wait until document.body exists after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("keydown", escape);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", escape);
      document.body.style.overflow = old;
    };
  }, [open, close]);

  async function upload(file: File | undefined, target: "cover" | "banner") {
    if (!file) return;
    setError("");
    const prepared = await compressImageForUpload(file);
    const body = new FormData();
    body.append("file", prepared);
    const response = await fetch("/api/upload", { method: "POST", body });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      url?: string;
      token?: string;
    };
    if (!response.ok || !data.url || !data.token)
      return setError(data.error ?? "Không thể tải ảnh lên.");
    if (target === "cover") {
      setCoverUrl(data.url);
      setCoverToken(data.token);
    } else {
      setBannerUrl(data.url);
      setBannerToken(data.token);
    }
  }

  function submit(data: FormData) {
    setError("");
    startTransition(async () => {
      try {
        if (editing) await updateCategory(data);
        else {
          const created =
            mode === "collection"
              ? await createCollection(data)
              : await createSeries(data);
          onCreated?.({ id: created.id, mode });
        }
        setOpen(false);
        toast.success(
          editing
            ? "Đã cập nhật"
            : mode === "collection"
              ? "Đã tạo bộ sưu tập"
              : "Đã tạo series",
        );
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Không thể lưu thay đổi.",
        );
      }
    });
  }

  const triggerClass =
    trigger === "icon"
      ? "absolute left-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-on-media shadow-md backdrop-blur transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
      : trigger === "header-icon"
        ? "grid h-10 w-10 place-items-center rounded-xl border border-app-border bg-panel text-secondary"
        : trigger === "edit"
          ? "inline-flex items-center gap-2 rounded-xl bg-black/45 px-3 py-2 text-xs font-bold text-on-media backdrop-blur"
          : trigger === "settings"
            ? "flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[9px] font-bold text-muted"
            : trigger === "menu"
              ? "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs text-secondary hover:bg-accent-soft"
              : trigger === "inline"
                ? "inline-flex items-center gap-1 text-[10px] font-bold text-accent-text hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                : "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-violet-950/30";
  const inlineLabel =
    mode === "collection" ? "Thêm bộ sưu tập" : "Thêm series";
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          if (trigger === "menu")
            event.currentTarget.closest("details")?.removeAttribute("open");
          setMode(category?.parentId ? "series" : initialMode);
          setOpen(true);
        }}
        className={triggerClass}
        aria-label={
          trigger === "icon"
            ? `Chỉnh sửa series ${category?.name}`
            : trigger === "inline"
              ? inlineLabel
              : editing
                ? `Chỉnh sửa ${category?.name}`
                : "Thêm mới"
        }
      >
        {trigger === "icon" ? (
          <Edit3 size={15} />
        ) : trigger === "header-icon" ? (
          <Settings size={19} />
        ) : trigger === "settings" ? (
          <>
            <Settings size={18} />
            Thiết lập
          </>
        ) : trigger === "menu" ? (
          <>
            <Settings size={15} />
            Thiết lập
          </>
        ) : trigger === "inline" ? (
          <>
            <Plus size={12} />
            {inlineLabel}
          </>
        ) : (
          <>
            {editing ? <Edit3 size={14} /> : <Plus size={17} />}
            {editing ? "Chỉnh sửa" : "Thêm mới"}
          </>
        )}
      </button>
      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] grid place-items-center bg-black/70 p-3 backdrop-blur-sm"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-app-border bg-surface p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id={titleId} className="font-black text-primary">
                    {editing
                      ? `Chỉnh sửa ${mode === "collection" ? "bộ sưu tập" : "series"}`
                      : mode === "collection"
                        ? "Tạo bộ sưu tập"
                        : "Tạo series / bộ"}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    Cập nhật thông tin, ảnh cover và banner ngay tại đây.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Đóng"
                  className="rounded-lg bg-accent-soft p-2 text-secondary"
                >
                  <X size={18} />
                </button>
              </div>
              {!editing && !lockMode && (
                <div className="mt-4 grid grid-cols-2 rounded-lg bg-surface-raised p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setMode("collection")}
                    className={`rounded-md py-2 ${mode === "collection" ? "bg-violet-500 text-white" : "text-muted"}`}
                  >
                    Bộ sưu tập
                  </button>
                  <button
                    type="button"
                    disabled={!collections.length}
                    onClick={() => setMode("series")}
                    className={`rounded-md py-2 ${mode === "series" ? "bg-violet-500 text-white" : "text-muted"}`}
                  >
                    Series / Bộ
                  </button>
                </div>
              )}
              <form method="post" action={submit} className="mt-5 space-y-4">
                {category && (
                  <input type="hidden" name="id" value={category.id} />
                )}
                <input
                  type="hidden"
                  name="coverImageToken"
                  value={coverToken}
                />
                <input
                  type="hidden"
                  name="bannerImageToken"
                  value={bannerToken}
                />
                <ImagePicker
                  id={`cover-${category?.id ?? mode}`}
                  label="Ảnh cover"
                  url={coverUrl}
                  ratio="aspect-[1.35/1]"
                  onFile={(f) => upload(f, "cover")}
                />
                {mode === "collection" && (
                  <ImagePicker
                    id={`banner-${category?.id ?? mode}`}
                    label="Banner rộng (3:1)"
                    url={bannerUrl}
                    ratio="aspect-[3/1]"
                    onFile={(f) => upload(f, "banner")}
                  />
                )}
                <p className="text-[11px] text-muted">{IMAGE_UPLOAD_HELP}</p>
                {mode === "series" && (
                  <label className="block text-xs font-bold text-muted">
                    Thuộc bộ sưu tập *
                    <select
                      name="parentId"
                      defaultValue={category?.parentId ?? parentId}
                      required
                      disabled={editing || (lockMode && Boolean(parentId))}
                      className="mt-1.5 w-full rounded-lg border border-app-border bg-surface-raised px-3 py-2.5 text-sm text-primary disabled:opacity-70"
                    >
                      {collections.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {(editing || (lockMode && parentId)) && (
                      <input
                        type="hidden"
                        name="parentId"
                        value={category?.parentId ?? parentId}
                      />
                    )}
                  </label>
                )}
                {mode === "collection" && editing && (
                  <input type="hidden" name="parentId" value="" />
                )}
                <Field
                  name="name"
                  label="Tên *"
                  defaultValue={category?.name}
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    name="releaseYear"
                    label="Năm bắt đầu"
                    type="number"
                    defaultValue={category?.releaseYear ?? undefined}
                  />
                  <label className="text-xs font-bold text-muted">
                    Màu chủ đạo
                    <input
                      name="accentColor"
                      type="color"
                      defaultValue={category?.accentColor ?? "#8b5cf6"}
                      className="mt-1.5 h-10 w-full rounded-lg border border-app-border bg-surface-raised p-1"
                    />
                  </label>
                </div>
                <Field
                  name="targetItemCount"
                  label="Số lượng mục tiêu"
                  type="number"
                  min="1"
                  defaultValue={category?.targetItemCount ?? undefined}
                />
                <label className="block text-xs font-bold text-muted">
                  Mô tả
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={category?.description ?? ""}
                    className="mt-1.5 w-full rounded-lg border border-app-border bg-surface-raised px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
                  />
                </label>
                {error && (
                  <p
                    aria-live="polite"
                    className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300"
                  >
                    {error}
                  </p>
                )}
                <button
                  disabled={pending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                >
                  {pending && (
                    <LoaderCircle size={16} className="animate-spin" />
                  )}
                  {pending
                    ? "Đang lưu..."
                    : editing
                      ? "Lưu thay đổi"
                      : "Tạo mới"}
                </button>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
export function CollectionCreateDialog(props: Omit<DialogProps, "category">) {
  return <CategoryDialog {...props} />;
}
export function EditCategoryDialog(
  props: DialogProps & { category: CategoryValue },
) {
  return <CategoryDialog {...props} />;
}
function ImagePicker({
  id,
  label,
  url,
  ratio,
  onFile,
}: {
  id: string;
  label: string;
  url: string;
  ratio: string;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <>
      <input
        id={id}
        type="file"
        accept={IMAGE_UPLOAD_ACCEPT}
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <label
        htmlFor={id}
        className={`flex ${ratio} cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-violet-400/50 bg-violet-500/5`}
      >
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-xs font-bold text-accent-text">
            <Camera size={22} />
            {label}
          </span>
        )}
      </label>
    </>
  );
}
function Field({
  label,
  ...props
}: React.ComponentProps<"input"> & { label: string }) {
  return (
    <label className="block text-xs font-bold text-muted">
      {label}
      <input
        {...props}
        className="mt-1.5 w-full rounded-lg border border-app-border bg-surface-raised px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
      />
    </label>
  );
}
