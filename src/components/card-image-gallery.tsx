"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, X, ZoomIn } from "lucide-react";

const SWIPE_X = 48;
const SWIPE_DOWN = 90;
const VELOCITY_X = 0.35; // px/ms
const IMAGE_CACHE_VERSION = "20260719-standalone-path-fix";

function cacheBustedImageUrl(url: string) {
  if (!url.startsWith("/api/uploads/")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${IMAGE_CACHE_VERSION}`;
}

export function CardImageGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const uniqueImages = [...new Set(images.filter(Boolean))];
  const count = uniqueImages.length;
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [animating, setAnimating] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; t: number } | null>(
    null,
  );
  const axis = useRef<"x" | "y" | null>(null);
  const dragXRef = useRef(0);
  const dragYRef = useRef(0);
  const moved = useRef(false);
  const activeRef = useRef(0);
  const safeActive = Math.min(active, Math.max(count - 1, 0));
  const thumb = uniqueImages[safeActive] ?? null;

  useEffect(() => {
    activeRef.current = safeActive;
  }, [safeActive]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLightbox();
      if (count < 2 || animating) return;
      if (event.key === "ArrowLeft") goTo(safeActive - 1);
      if (event.key === "ArrowRight") goTo(safeActive + 1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightbox, count, safeActive, animating]);

  function closeLightbox() {
    setLightbox(false);
    resetDrag();
  }

  function resetDrag() {
    pointerStart.current = null;
    axis.current = null;
    dragXRef.current = 0;
    dragYRef.current = 0;
    setDragX(0);
    setDragY(0);
    setDragging(false);
  }

  function goTo(next: number) {
    if (count < 2) return;
    const wrapped = ((next % count) + count) % count;
    if (wrapped === activeRef.current) return;
    setAnimating(true);
    setActive(wrapped);
    window.setTimeout(() => setAnimating(false), 280);
  }

  function stageWidth() {
    return stageRef.current?.clientWidth || window.innerWidth || 360;
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (animating) return;
    if ((event.target as HTMLElement).closest("button")) return;
    pointerStart.current = {
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
    };
    moved.current = false;
    axis.current = null;
    dragXRef.current = 0;
    dragYRef.current = 0;
    setDragX(0);
    setDragY(0);
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerStart.current || !dragging) return;
    const dx = event.clientX - pointerStart.current.x;
    const dy = event.clientY - pointerStart.current.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved.current = true;

    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
    }

    if (axis.current === "x" && count > 1) {
      // Resistance ở 2 đầu (không loop trong lúc kéo — loop khi thả)
      const atStart = safeActive === 0 && dx > 0;
      const atEnd = safeActive === count - 1 && dx < 0;
      const resisted = atStart || atEnd ? dx * 0.35 : dx;
      dragXRef.current = resisted;
      dragYRef.current = 0;
      setDragX(resisted);
      setDragY(0);
    } else if (axis.current === "y") {
      const down = Math.max(0, dy);
      dragYRef.current = down;
      dragXRef.current = 0;
      setDragY(down);
      setDragX(0);
    }
  }

  function onPointerUp() {
    if (!pointerStart.current) return;
    const dx = dragXRef.current;
    const dy = dragYRef.current;
    const locked = axis.current;
    const elapsed = Math.max(1, performance.now() - pointerStart.current.t);
    const velocity = dx / elapsed;
    const width = stageWidth();
    resetDrag();

    if (locked === "y" && dy >= SWIPE_DOWN) {
      closeLightbox();
      return;
    }

    if (locked === "x" && count > 1) {
      const shouldNext =
        dx < -SWIPE_X || velocity < -VELOCITY_X || dx < -width * 0.22;
      const shouldPrev =
        dx > SWIPE_X || velocity > VELOCITY_X || dx > width * 0.22;
      if (shouldNext) {
        goTo(safeActive + 1);
        return;
      }
      if (shouldPrev) {
        goTo(safeActive - 1);
        return;
      }
    }
  }

  function onStageClick() {
    if (!moved.current && !animating) closeLightbox();
  }

  const dismissProgress = Math.min(1, dragY / 220);
  const backdropOpacity = 0.92 * (1 - dismissProgress * 0.65);
  // Track: mỗi slide = 100% width stage; cộng thêm drag khi đang kéo
  const trackOffsetPct = -safeActive * 100;
  const trackDragPx = dragging && axis.current !== "y" ? dragX : 0;

  return (
    <div className="min-w-0">
      <div className="relative aspect-[2.5/3.5] overflow-hidden rounded-xl border border-app-border bg-panel shadow-2xl shadow-[var(--shadow)] sm:rounded-2xl">
        {thumb ? (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="group relative block h-full w-full cursor-zoom-in"
            aria-label="Xem ảnh lớn"
          >
            <img
              src={cacheBustedImageUrl(thumb)}
              alt={`${name} — ảnh ${safeActive + 1}`}
              className="h-full w-full object-cover transition group-hover:brightness-95"
            />
            <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg border border-white/20 bg-black/50 px-2 py-1 text-[10px] font-bold text-white opacity-90 backdrop-blur sm:opacity-0 sm:transition sm:group-hover:opacity-100">
              <ZoomIn size={12} />
              Phóng to
            </span>
          </button>
        ) : (
          <div className="grid h-full place-items-center text-muted">
            <ImageIcon size={42} />
          </div>
        )}
        <span className="pointer-events-none absolute bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[10px] text-white backdrop-blur">
          <ImageIcon size={11} />
          <strong>
            {thumb ? safeActive + 1 : 0}/{count}
          </strong>
        </span>
      </div>
      {count > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {uniqueImages.map((url, index) => (
            <button
              type="button"
              key={`${url}-${index}`}
              onClick={() => setActive(index)}
              aria-label={`Xem ảnh ${index + 1}`}
              className={`h-12 w-9 shrink-0 overflow-hidden rounded-md border-2 ${
                safeActive === index ? "border-violet-500" : "border-app-border"
              }`}
            >
              <img
                src={cacheBustedImageUrl(url)}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {lightbox && thumb && (
        <div
          className="fixed inset-0 z-[100] flex flex-col backdrop-blur-sm"
          style={{ backgroundColor: `rgba(0,0,0,${backdropOpacity})` }}
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh lớn"
        >
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 text-white"
            style={{ opacity: 1 - dismissProgress }}
          >
            <p className="min-w-0 truncate text-sm font-bold">
              {name}
              <span className="ml-2 font-normal text-white/60">
                {safeActive + 1}/{count}
              </span>
            </p>
            <button
              type="button"
              onClick={closeLightbox}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/15"
              aria-label="Đóng"
            >
              <X size={20} />
            </button>
          </div>

          <div
            ref={stageRef}
            className="relative min-h-0 flex-1 touch-none overflow-hidden"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={onStageClick}
          >
            {count > 1 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goTo(safeActive - 1);
                }}
                className="absolute left-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4 sm:grid"
                aria-label="Ảnh trước"
                style={{ opacity: 1 - dismissProgress }}
              >
                <ChevronLeft size={22} />
              </button>
            )}

            <div
              className="flex h-full"
              style={{
                width: `${Math.max(count, 1) * 100}%`,
                transform: `translate3d(calc(${trackOffsetPct / Math.max(count, 1)}% + ${trackDragPx}px), ${dragY}px, 0) scale(${1 - dismissProgress * 0.06})`,
                transition:
                  dragging || axis.current === "y"
                    ? "none"
                    : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
                opacity: 1 - dismissProgress * 0.4,
              }}
            >
              {uniqueImages.map((url, index) => (
                <div
                  key={`slide-${url}-${index}`}
                  className="flex h-full shrink-0 items-center justify-center px-3"
                  style={{ width: `${100 / Math.max(count, 1)}%` }}
                >
                  <img
                    src={cacheBustedImageUrl(url)}
                    alt={`${name} — ảnh ${index + 1}`}
                    draggable={false}
                    className="max-h-full max-w-full select-none object-contain"
                  />
                </div>
              ))}
            </div>

            {count > 1 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goTo(safeActive + 1);
                }}
                className="absolute right-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4 sm:grid"
                aria-label="Ảnh sau"
                style={{ opacity: 1 - dismissProgress }}
              >
                <ChevronRight size={22} />
              </button>
            )}

            <p
              className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-center text-[10px] text-white/50 sm:hidden"
              style={{ opacity: 1 - dismissProgress }}
            >
              {count > 1
                ? "Vuốt ngang đổi ảnh · Vuốt xuống đóng"
                : "Vuốt xuống để đóng"}
            </p>
          </div>

          {count > 1 && (
            <div
              className="flex justify-center gap-2 overflow-x-auto px-4 pb-5"
              style={{ opacity: 1 - dismissProgress }}
            >
              {uniqueImages.map((url, index) => (
                <button
                  type="button"
                  key={`lb-${url}-${index}`}
                  onClick={() => goTo(index)}
                  className={`h-14 w-10 shrink-0 overflow-hidden rounded-md border-2 transition ${
                    safeActive === index
                      ? "border-violet-400"
                      : "border-white/20 opacity-70"
                  }`}
                >
                  <img
                src={cacheBustedImageUrl(url)}
                alt=""
                className="h-full w-full object-cover"
              />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
