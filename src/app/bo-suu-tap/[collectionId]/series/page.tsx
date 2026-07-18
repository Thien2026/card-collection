import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  Grid2X2,
  Heart,
  Layers3,
  List,
  PackageOpen,
  SearchX,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UnifiedSearchAutocomplete } from "@/components/unified-search-autocomplete";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { formatVnd } from "@/lib/format";
import { SortMenu } from "@/components/sort-menu";
import {
  CollectionCreateDialog,
  EditCategoryDialog,
} from "../../collection-create-dialog";
import { DeleteCategoryButton } from "../../delete-category-button";

const filterOptions = [
  { value: "ALL", label: "Tất cả" },
  { value: "HAS_ITEMS", label: "Có thẻ" },
  { value: "EMPTY", label: "Trống" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "INCOMPLETE", label: "Chưa hoàn thành" },
  { value: "HAS_FAVORITE_CARDS", label: "Có thẻ yêu thích" },
] as const;
const sortOptions = [
  { value: "newest", label: "Mới nhất" },
  { value: "oldest", label: "Cũ nhất" },
  { value: "name", label: "Tên" },
  { value: "items", label: "Số lượng thẻ" },
  { value: "value", label: "Giá trị" },
  { value: "completion", label: "Mức hoàn thành" },
] as const;
type Filter = (typeof filterOptions)[number]["value"];
type Sort = (typeof sortOptions)[number]["value"];
type View = "grid" | "list";

function seriesHref(
  collectionId: string,
  state: { q: string; filter: Filter; sort: Sort; view: View; page: number },
  changes: Partial<{
    q: string;
    filter: Filter;
    sort: Sort;
    view: View;
    page: number;
  }> = {},
) {
  const next = { ...state, ...changes };
  const query = new URLSearchParams();
  if (next.q) query.set("q", next.q);
  if (next.filter !== "ALL") query.set("filter", next.filter);
  if (next.sort !== "newest") query.set("sort", next.sort);
  if (next.view !== "grid") query.set("view", next.view);
  if (next.page > 1) query.set("page", String(next.page));
  const suffix = query.toString();
  return `/bo-suu-tap/${collectionId}/series${suffix ? `?${suffix}` : ""}`;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ collectionId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const s = await auth();
  if (!s) redirect("/dang-nhap");
  const { collectionId } = await params,
    x = await searchParams,
    q = (x.q || "").trim(),
    filter = filterOptions.some((option) => option.value === x.filter)
      ? (x.filter as Filter)
      : "ALL",
    sort = sortOptions.some((option) => option.value === x.sort)
      ? (x.sort as Sort)
      : "newest",
    view: View = x.view === "list" ? "list" : "grid",
    requestedPage = Math.max(1, Number(x.page) || 1);
  const c = await prisma.category.findFirst({
    where: { id: collectionId, userId: s.user.id, parentId: null },
  });
  if (!c) notFound();
  const favoriteRoot = await prisma.categoryFavorite.findFirst({
    where: {
      userId: s.user.id,
      categoryId: collectionId,
      category: { parentId: null },
    },
    select: { id: true },
  });
  const rows = await prisma.category.findMany({
    where: {
      parentId: collectionId,
      userId: s.user.id,
      name: { contains: q, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      coverImageUrl: true,
      bannerImageUrl: true,
      accentColor: true,
      targetItemCount: true,
      createdAt: true,
      description: true,
      parentId: true,
      releaseYear: true,
      _count: { select: { cards: true } },
      cards: {
        select: {
          favorites: {
            where: { userId: s.user.id },
            select: { id: true },
            take: 1,
          },
          inventoryItems: {
            where: { userId: s.user.id, status: "AVAILABLE" },
            select: { costPrice: true },
          },
        },
      },
    },
  });
  const searched = rows.map((r) => {
    const count = r.cards.reduce(
      (total, card) => total + card.inventoryItems.length,
      0,
    );
    return {
      ...r,
      count,
      value: r.cards
        .flatMap((card) => card.inventoryItems)
        .reduce((total, item) => total + item.costPrice, 0),
      completion: r.targetItemCount
        ? Math.min(
            100,
            Math.round((count / r.targetItemCount) * 100),
          )
        : null,
      hasFavoriteCards: favoriteRoot
        ? r._count.cards > 0
        : r.cards.some((card) => card.favorites.length > 0),
    };
  });
  const matchesFilter = (row: (typeof searched)[number], value: Filter) =>
    value === "HAS_ITEMS"
      ? row.count > 0
      : value === "EMPTY"
        ? row.count === 0
        : value === "COMPLETED"
          ? row.completion === 100
          : value === "INCOMPLETE"
            ? row.completion !== null && row.completion < 100
            : value === "HAS_FAVORITE_CARDS"
              ? row.hasFavoriteCards
              : true;
  const filterCounts = Object.fromEntries(
    filterOptions.map((option) => [
      option.value,
      searched.filter((row) => matchesFilter(row, option.value)).length,
    ]),
  ) as Record<Filter, number>;
  const data = searched.filter((r) => matchesFilter(r, filter)).sort((a, b) =>
      sort === "oldest"
        ? +a.createdAt - +b.createdAt
        : sort === "name"
          ? a.name.localeCompare(b.name)
          : sort === "items"
            ? b.count - a.count
            : sort === "value"
              ? b.value - a.value
              : sort === "completion"
                ? (b.completion || 0) - (a.completion || 0)
                : +b.createdAt - +a.createdAt,
    );
  const pages = Math.max(1, Math.ceil(data.length / 12)),
    page = Math.min(requestedPage, pages),
    shown = data.slice((page - 1) * 12, page * 12);
  const queryState = { q, filter, sort, view, page };
  const collectionOption = [{ id: c.id, name: c.name }];
  const currentSortLabel =
    sortOptions.find((option) => option.value === sort)?.label ?? "Mới nhất";

  return (
    <AppShell isAdmin={s.user.role === "ADMIN"}>
      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header>
          <div className="flex items-start gap-3">
            <BackButton
              href={`/bo-suu-tap/${collectionId}`}
              label={`Quay lại ${c.name}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                      Series
                    </h1>
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-500/15 text-accent-text ring-1 ring-violet-500/20">
                      <Layers3 size={15} />
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted sm:text-sm">
                    Tất cả series trong bộ sưu tập {c.name}
                  </p>
                </div>
                <CollectionCreateDialog
                  collections={collectionOption}
                  initialMode="series"
                  parentId={collectionId}
                  lockMode
                />
              </div>
            </div>
          </div>
        </header>

        <form
          action={`/bo-suu-tap/${collectionId}/series`}
          className="mt-6 max-w-xl"
        >
          <input type="hidden" name="filter" value={filter} />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="view" value={view} />
          <UnifiedSearchAutocomplete
            defaultValue={q}
            collectionId={collectionId}
            placeholder="Tìm series theo tên..."
            className="w-full rounded-2xl border border-app-border bg-surface py-3.5 pl-10 pr-4 text-sm shadow-sm outline-none transition placeholder:text-muted focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15"
          />
        </form>

        <nav
          aria-label="Lọc series"
          className="-mx-3 mt-5 flex gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0"
        >
          {filterOptions.map((option) => {
            const active = filter === option.value;
            return (
              <Link
                key={option.value}
                href={seriesHref(collectionId, queryState, {
                  filter: option.value,
                  page: 1,
                })}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  active
                    ? "border-violet-500 bg-violet-600 text-white shadow-md shadow-violet-950/20"
                    : "border-app-border bg-surface text-secondary hover:border-violet-500/40 hover:text-primary"
                }`}
              >
                {option.label}
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                    active ? "bg-white/15 text-white" : "bg-panel text-muted"
                  }`}
                >
                  {filterCounts[option.value]}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-app-border pt-4">
          <p className="hidden text-xs text-muted sm:block">
            {data.length} series phù hợp
          </p>
          <div className="ml-auto flex items-center gap-2">
            <SortMenu
              currentLabel={currentSortLabel}
              options={sortOptions.map((option) => ({
                ...option,
                href: seriesHref(collectionId, queryState, {
                  sort: option.value,
                  page: 1,
                }),
              }))}
            />
            <div
              className="flex rounded-xl border border-app-border bg-surface p-1"
              aria-label="Kiểu hiển thị"
            >
              {(
                [
                  { value: "grid", label: "Dạng lưới", icon: Grid2X2 },
                  { value: "list", label: "Dạng danh sách", icon: List },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                return (
                  <Link
                    key={option.value}
                    href={seriesHref(collectionId, queryState, {
                      view: option.value,
                      page: 1,
                    })}
                    aria-label={option.label}
                    aria-current={view === option.value ? "page" : undefined}
                    className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                      view === option.value
                        ? "bg-violet-600 text-white"
                        : "text-muted hover:bg-panel hover:text-primary"
                    }`}
                  >
                    <Icon size={15} />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {shown.length ? (
          <section
            className={`mt-5 ${
              view === "grid"
                ? "grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 xl:grid-cols-5"
                : "space-y-3"
            }`}
          >
            {shown.map((r) => (
              <article
                className={
                  view === "grid"
                    ? "group min-w-0 overflow-hidden rounded-2xl border border-app-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:border-violet-500/30 hover:shadow-xl hover:shadow-violet-950/10"
                    : "group flex min-w-0 gap-3 rounded-2xl border border-app-border bg-surface p-3 shadow-sm transition hover:border-violet-500/30 sm:gap-4"
                }
                key={r.id}
              >
                <div
                  className={
                    view === "grid"
                      ? "relative"
                      : "relative h-28 w-24 shrink-0 sm:h-32 sm:w-28"
                  }
                >
                  <Link
                    href={`/bo-suu-tap/${collectionId}/${r.id}`}
                    className={`relative block overflow-hidden bg-gradient-to-br from-violet-700 via-indigo-800 to-slate-950 ${
                      view === "grid"
                        ? "aspect-[4/5]"
                        : "h-full w-full rounded-xl"
                    }`}
                  >
                    {r.coverImageUrl ? (
                      <img
                        src={r.coverImageUrl}
                        alt={r.name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
                      />
                    ) : (
                      <span
                        className="absolute inset-0 grid place-items-center"
                        style={{
                          background: `linear-gradient(145deg, ${r.accentColor ?? "#7c3aed"}, #111827)`,
                        }}
                      >
                        <Layers3
                          size={view === "grid" ? 38 : 26}
                          className="text-white/75"
                        />
                      </span>
                    )}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
                  </Link>
                  <EditCategoryDialog
                    collections={collectionOption}
                    category={r}
                    trigger="icon"
                  />
                  <DeleteCategoryButton
                    id={r.id}
                    collectionId={collectionId}
                    name={r.name}
                    kind="series"
                    hasContents={r._count.cards > 0}
                  />
                </div>

                <div
                  className={
                    view === "grid"
                      ? "min-w-0 p-2 sm:p-3"
                      : "flex min-w-0 flex-1 flex-col justify-center py-1"
                  }
                >
                  <Link
                    href={`/bo-suu-tap/${collectionId}/${r.id}`}
                    className="block truncate text-xs font-black text-primary transition hover:text-accent-text sm:text-sm"
                  >
                    {r.name}
                  </Link>
                  <span className="mt-1.5 w-fit rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-black text-accent-text sm:px-2 sm:py-1 sm:text-[10px]">
                    {r.count} thẻ
                  </span>
                  <div
                    className={`mt-2 ${
                      view === "list"
                        ? "sm:flex sm:items-end sm:justify-between sm:gap-6"
                        : ""
                    }`}
                  >
                    <div>
                      <p className="text-[9px] font-medium text-secondary sm:text-[11px]">
                        {r.targetItemCount
                          ? `${r.count} / ${r.targetItemCount} thẻ`
                          : `${r.count} thẻ · Chưa đặt mục tiêu`}
                      </p>
                      <p className="mt-1 truncate text-[9px] text-muted sm:text-[10px]">
                        Giá trị {formatVnd(r.value)}
                      </p>
                    </div>
                    {r.completion !== null && (
                      <div
                        className={
                          view === "list"
                            ? "mt-3 w-full max-w-xs sm:mt-0"
                            : "mt-3"
                        }
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold text-muted">
                          <span>Hoàn thành</span>
                          <span>{r.completion}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500"
                            style={{ width: `${r.completion}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="mt-8 grid min-h-64 place-items-center rounded-3xl border border-dashed border-app-border bg-surface/60 px-6 py-12 text-center">
            <div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/10 text-accent-text">
                {q ? (
                  <SearchX size={25} />
                ) : filter === "EMPTY" ? (
                  <PackageOpen size={25} />
                ) : (
                  <Heart size={25} />
                )}
              </span>
              <h2 className="mt-4 font-black">
                Không tìm thấy series phù hợp
              </h2>
              <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-muted">
                {q
                  ? `Không có series nào khớp với “${q}”. Hãy thử từ khóa khác.`
                  : "Bộ lọc hiện tại chưa có series. Hãy chọn bộ lọc khác hoặc tạo series mới."}
              </p>
              {(q || filter !== "ALL") && (
                <Link
                  href={seriesHref(collectionId, queryState, {
                    q: "",
                    filter: "ALL",
                    page: 1,
                  })}
                  className="mt-4 inline-flex rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white"
                >
                  Xem tất cả series
                </Link>
              )}
            </div>
          </section>
        )}

        {pages > 1 && (
          <nav
            aria-label="Phân trang"
            className="mt-8 flex flex-wrap justify-center gap-2"
          >
            {Array.from({ length: pages }, (_, i) => (
              <Link
                key={i}
                href={seriesHref(collectionId, queryState, { page: i + 1 })}
                aria-current={page === i + 1 ? "page" : undefined}
                className={`grid h-9 min-w-9 place-items-center rounded-xl border px-2 text-xs font-bold transition ${
                  page === i + 1
                    ? "border-violet-600 bg-violet-600 text-white"
                    : "border-app-border bg-surface text-secondary hover:border-violet-500/40"
                }`}
              >
                {i + 1}
              </Link>
            ))}
          </nav>
        )}
      </main>
    </AppShell>
  );
}
