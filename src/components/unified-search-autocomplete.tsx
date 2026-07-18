"use client";

import { Boxes, Layers3, LoaderCircle, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMarkNavigationPending } from "./navigation-pending";

export type UnifiedSearchResult = {
  id: string;
  type: "card" | "collection" | "series";
  name: string;
  image: string | null;
  meta: string;
  href: string;
};
type Groups = {
  cards: UnifiedSearchResult[];
  collections: UnifiedSearchResult[];
  series: UnifiedSearchResult[];
};
type Props = {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
  collectionId?: string;
  seriesId?: string;
  className?: string;
};
const EMPTY: Groups = { cards: [], collections: [], series: [] };

export function UnifiedSearchAutocomplete({
  name = "q",
  defaultValue = "",
  placeholder = "Tìm card, bộ sưu tập hoặc series...",
  autoFocus,
  collectionId,
  seriesId,
  className = "w-full rounded-xl border border-app-border bg-panel py-3 pl-9 pr-3 text-sm text-primary outline-none placeholder:text-muted focus:border-violet-500",
}: Props) {
  const router = useRouter();
  const markNavigationPending = useMarkNavigationPending();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(defaultValue);
  const [groups, setGroups] = useState<Groups>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const normalized = query.trim();
  const sections = useMemo(
    () =>
      [
        { key: "cards", title: "CARD", items: groups.cards },
        { key: "collections", title: "BỘ SƯU TẬP", items: groups.collections },
        { key: "series", title: "SERIES", items: groups.series },
      ] as const,
    [groups],
  );
  const flat = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );
  const showPanel = focused && normalized.length >= 2;
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setFocused(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    if (normalized.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ q: normalized });
      if (collectionId) params.set("collectionId", collectionId);
      if (seriesId) params.set("seriesId", seriesId);
      try {
        const response = await fetch(`/api/search?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("SEARCH_FAILED");
        setGroups((await response.json()) as Groups);
        setActive(-1);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setGroups(EMPTY);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 275);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, collectionId, seriesId]);
  const select = (item: UnifiedSearchResult) => {
    setFocused(false);
    markNavigationPending();
    router.push(item.href);
  };
  let index = -1;
  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 flex-1 ${showPanel ? "z-[80]" : ""}`}
    >
      <Search
        size={16}
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted"
      />
      <input
        name={name}
        value={query}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        className={`min-w-0 ${className}`}
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          setFocused(true);
          if (value.trim().length < 2) {
            setGroups(EMPTY);
            setLoading(false);
            setActive(-1);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setFocused(false);
          else if (event.key === "ArrowDown" && flat.length) {
            event.preventDefault();
            setActive((value) => Math.min(flat.length - 1, value + 1));
          } else if (event.key === "ArrowUp" && flat.length) {
            event.preventDefault();
            setActive((value) => Math.max(-1, value - 1));
          } else if (event.key === "Enter" && active >= 0 && flat[active]) {
            event.preventDefault();
            select(flat[active]);
          }
        }}
      />
      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-[100] mt-2 max-h-[min(28rem,65vh)] overflow-y-auto rounded-2xl border border-app-border bg-surface-raised p-1.5 shadow-2xl"
        >
          {loading ? (
            <p className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-muted">
              <LoaderCircle className="animate-spin" size={16} /> Đang tìm...
            </p>
          ) : flat.length ? (
            sections.map((section) =>
              section.items.length ? (
                <section key={section.key}>
                  <h2 className="px-3 pb-1 pt-3 text-[10px] font-black tracking-wider text-muted">
                    {section.title}
                  </h2>
                  {section.items.map((item) => {
                    index += 1;
                    const itemIndex = index;
                    const Icon =
                      item.type === "collection"
                        ? Boxes
                        : item.type === "series"
                          ? Layers3
                          : Sparkles;
                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        id={`${listId}-${itemIndex}`}
                        type="button"
                        role="option"
                        aria-selected={active === itemIndex}
                        onMouseEnter={() => setActive(itemIndex)}
                        onClick={() => select(item)}
                        className={`flex w-full items-center gap-3 rounded-xl p-2 text-left ${active === itemIndex ? "bg-accent-soft" : "hover:bg-accent-soft"}`}
                      >
                        <span className="grid h-12 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-panel">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Icon size={17} className="text-accent-text" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-primary">
                            {item.name}
                          </span>
                          <span className="mt-1 block truncate text-[11px] text-muted">
                            {item.meta}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </section>
              ) : null,
            )
          ) : (
            <p className="px-3 py-8 text-center text-xs text-muted">
              Không tìm thấy kết quả phù hợp.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
