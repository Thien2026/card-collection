"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UnifiedSearchAutocomplete } from "@/components/unified-search-autocomplete";

export function GlobalCardSearch() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Tìm kiếm card"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="grid h-10 w-10 place-items-center rounded-xl border border-app-border bg-panel text-secondary"
      >
        <Search size={19} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[120] bg-black/20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-[2px]">
              <div
                ref={panelRef}
                role="dialog"
                aria-label="Tìm kiếm toàn cục"
                className="mx-auto flex w-full max-w-lg min-w-0 items-center gap-1 rounded-2xl border border-app-border bg-surface-raised p-1 shadow-2xl"
              >
                <div className="min-w-0 flex-1">
                  <UnifiedSearchAutocomplete
                    autoFocus
                    className="min-w-0 w-full rounded-xl border border-violet-400 bg-surface-raised py-3 pl-9 pr-3 text-sm text-primary outline-none placeholder:text-muted"
                  />
                </div>
                <button
                  type="button"
                  aria-label="Đóng tìm kiếm"
                  onClick={() => setOpen(false)}
                  className="mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-accent-soft hover:text-primary"
                >
                  <X size={19} />
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
