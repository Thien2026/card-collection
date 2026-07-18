import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  currentPage,
  totalPages,
  basePath,
  pageParam = "page",
  params = {},
}: {
  currentPage: number;
  totalPages: number;
  basePath: string;
  pageParam?: string;
  params?: Record<string, string | number | undefined>;
}) {
  if (totalPages <= 1) return null;

  const pages = pageWindow(currentPage, totalPages);

  function href(page: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
    if (page > 1) search.set(pageParam, String(page));
    else search.delete(pageParam);
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  return (
    <nav
      aria-label="Phân trang"
      className="mt-4 flex flex-wrap items-center justify-center gap-1.5"
    >
      <PageLink
        href={href(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1}
        label="Trang trước"
      >
        <ChevronLeft size={14} />
      </PageLink>
      {pages.map((page, index) =>
        page === null ? (
          <span
            key={`ellipsis-${index}`}
            className="grid h-8 min-w-8 place-items-center text-xs text-muted"
          >
            …
          </span>
        ) : (
          <Link
            key={page}
            href={href(page)}
            aria-current={page === currentPage ? "page" : undefined}
            className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[10px] font-black ${
              page === currentPage
                ? "bg-accent text-white"
                : "border border-app-border bg-surface text-secondary"
            }`}
          >
            {page}
          </Link>
        ),
      )}
      <PageLink
        href={href(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage >= totalPages}
        label="Trang sau"
      >
        <ChevronRight size={14} />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        aria-label={label}
        className="grid h-8 min-w-8 place-items-center rounded-lg border border-app-border bg-panel text-muted opacity-45"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="grid h-8 min-w-8 place-items-center rounded-lg border border-app-border bg-surface text-secondary"
    >
      {children}
    </Link>
  );
}

function pageWindow(current: number, total: number): Array<number | null> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  const result: Array<number | null> = [];
  for (const page of sorted) {
    const previous = result.at(-1);
    if (typeof previous === "number" && page - previous > 1) result.push(null);
    result.push(page);
  }
  return result;
}
