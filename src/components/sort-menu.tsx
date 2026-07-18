"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type SortOption = { value: string; label: string; href: string };

export function SortMenu({
  currentLabel,
  options,
  className = "",
}: {
  currentLabel: string;
  options: SortOption[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);
  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl border border-app-border bg-panel px-3 py-2.5 text-xs text-secondary"
      >
        Sắp xếp: <strong className="text-primary">{currentLabel}</strong>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-app-border bg-surface-raised p-1 shadow-2xl"
        >
          {options.map((option) => (
            <Link
              role="menuitem"
              key={option.value}
              href={option.href}
              onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2 text-xs ${option.label === currentLabel ? "bg-violet-500/15 text-accent-text" : "text-secondary hover:bg-accent-soft"}`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
