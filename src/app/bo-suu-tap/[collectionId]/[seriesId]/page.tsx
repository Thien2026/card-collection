import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import {
  Grid2X2,
  ImageIcon,
  List,
  Package,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { auth } from "@/auth";
import { RecentViewTracker } from "@/components/recent-view";
import { FavoriteButton } from "@/components/favorite-button";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { UnifiedSearchAutocomplete } from "@/components/unified-search-autocomplete";
import { SortMenu } from "@/components/sort-menu";
import { formatVnd } from "@/lib/format";
import { paginateInventoryGroups } from "@/lib/inventory-groups";
import { prisma } from "@/lib/prisma";
import { EditCategoryDialog } from "../../collection-create-dialog";

const uiItemTypes = [
  "ALL",
  "SINGLE_CARD",
  "BOOSTER",
  "BOX",
  "ACCESSORY",
] as const;
const sortOptions = [
  "newest",
  "oldest",
  "name-asc",
  "price-desc",
  "price-asc",
] as const;
const views = ["grid", "list"] as const;
const typeLabels = {
  ALL: "Tất cả",
  SINGLE_CARD: "Thẻ đơn",
  BOOSTER: "Booster",
  BOX: "Hộp",
  ACCESSORY: "Phụ kiện",
} as const;
const sortLabels = {
  newest: "Mới nhất",
  oldest: "Cũ nhất",
  "name-asc": "Tên A–Z",
  "price-desc": "Giá cao nhất",
  "price-asc": "Giá thấp nhất",
} as const;

type UiItemType = (typeof uiItemTypes)[number];
type Query = {
  q?: string;
  itemType?: string;
  sort?: string;
  view?: string;
  search?: string;
  edit?: string;
  page?: string;
};

export default async function SeriesItemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ collectionId: string; seriesId: string }>;
  searchParams: Promise<Query>;
}) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");

  const [{ collectionId, seriesId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const itemType: UiItemType = uiItemTypes.includes(
    query.itemType as UiItemType,
  )
    ? (query.itemType as UiItemType)
    : "ALL";
  const sort = sortOptions.includes(query.sort as (typeof sortOptions)[number])
    ? (query.sort as (typeof sortOptions)[number])
    : "newest";
  const view = views.includes(query.view as (typeof views)[number])
    ? (query.view as (typeof views)[number])
    : "grid";
  const q = query.q?.trim() ?? "";
  const searchOpen = query.search === "1" || Boolean(q);
  const editOpen = query.edit === "1";
  const requestedPage = /^\d+$/.test(query.page ?? "")
    ? Math.max(1, Number(query.page))
    : 1;
  const series = await prisma.category.findFirst({
    where: {
      id: seriesId,
      parentId: collectionId,
      userId: session.user.id,
      parent: { userId: session.user.id, parentId: null },
    },
    select: {
      id: true,
      name: true,
      parentId: true,
      description: true,
      coverImageUrl: true,
      bannerImageUrl: true,
      accentColor: true,
      releaseYear: true,
      targetItemCount: true,
      parent: { select: { id: true, name: true } },
    },
  });
  if (!series?.parent) notFound();
  const rootFavorite = await prisma.categoryFavorite.findFirst({
    where: {
      userId: session.user.id,
      categoryId: collectionId,
      category: { parentId: null, userId: session.user.id },
    },
    select: { id: true },
  });

  const sealedNameFilter =
    itemType === "BOOSTER"
      ? {
          OR: [
            { name: { contains: "booster", mode: "insensitive" as const } },
            { name: { contains: "pack", mode: "insensitive" as const } },
            { setName: { contains: "booster", mode: "insensitive" as const } },
            { setName: { contains: "pack", mode: "insensitive" as const } },
          ],
        }
      : itemType === "BOX"
        ? {
            OR: [
              { name: { contains: "box", mode: "insensitive" as const } },
              { name: { contains: "hộp", mode: "insensitive" as const } },
              { setName: { contains: "box", mode: "insensitive" as const } },
              { setName: { contains: "hộp", mode: "insensitive" as const } },
            ],
          }
        : {};
  const prismaItemType =
    itemType === "BOOSTER" || itemType === "BOX" ? "SEALED_PRODUCT" : itemType;
  const seriesTotals = await prisma.inventoryItem.aggregate({
    where: {
      userId: session.user.id,
      status: "AVAILABLE",
      card: {
        userId: session.user.id,
        categoryId: series.id,
      },
    },
    _sum: { costPrice: true },
    _count: true,
  });
  const itemWhere: Prisma.InventoryItemWhereInput = {
    userId: session.user.id,
    status: { in: ["AVAILABLE", "SOLD"] },
    card: {
      userId: session.user.id,
      categoryId: series.id,
      ...sealedNameFilter,
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  {
                    cardNumber: { contains: q, mode: "insensitive" as const },
                  },
                  { setName: { contains: q, mode: "insensitive" as const } },
                ],
              },
            ],
          }
        : {}),
    },
    ...(prismaItemType === "ALL"
      ? {}
      : {
          itemType: prismaItemType as
            | "SINGLE_CARD"
            | "SEALED_PRODUCT"
            | "ACCESSORY",
        }),
  };
  const cardInclude = {
    card: {
      select: {
        id: true,
        name: true,
        cardNumber: true,
        rarity: true,
        setName: true,
        favorites: {
          where: { userId: session.user.id },
          select: { id: true },
        },
      },
    },
  } as const;
  const {
    groups: pageGroups,
    totalGroups,
    totalPages,
    page,
  } = await paginateInventoryGroups({
    where: itemWhere,
    sort,
    page: requestedPage,
    pageSize: 18,
    include: cardInclude,
  });
  const availableCounts =
    pageGroups.length === 0
      ? []
      : await prisma.inventoryItem.groupBy({
          by: ["cardId", "condition", "itemType", "costPrice"],
          where: {
            ...itemWhere,
            status: "AVAILABLE",
            OR: pageGroups.map(({ item }) => ({
              cardId: item.cardId,
              condition: item.condition,
              itemType: item.itemType,
              costPrice: item.costPrice,
            })),
          },
          _count: { _all: true },
        });
  const availableByKey = new Map(
    availableCounts.map((group) => [
      `${group.cardId}::${group.condition}::${group.itemType}::${group.costPrice}`,
      group._count._all,
    ]),
  );
  const totalValue = seriesTotals._sum.costPrice ?? 0;
  const ownedCount = seriesTotals._count;
  const pagedItems: ItemGroup[] = pageGroups.map(({ item }) => {
    const quantity =
      availableByKey.get(
        `${item.cardId}::${item.condition}::${item.itemType}::${item.costPrice}`,
      ) ?? 0;
    return {
      ...item,
      quantity,
      soldOut: quantity === 0,
      favoriteSource:
        item.card.favorites.length > 0
          ? ("explicit" as const)
          : rootFavorite
            ? ("inherited" as const)
            : ("none" as const),
    };
  });
  const completion = series.targetItemCount
    ? Math.min(100, Math.round((ownedCount / series.targetItemCount) * 100))
    : null;
  const queryHref = (next: Partial<Query>) => {
    const values = { q, itemType, sort, view, page: String(page), ...next };
    if (next.page === undefined) values.page = "1";
    const search = new URLSearchParams();
    if (values.q) search.set("q", values.q);
    if (values.itemType && values.itemType !== "ALL")
      search.set("itemType", values.itemType);
    if (values.sort && values.sort !== "newest")
      search.set("sort", values.sort);
    if (values.view && values.view !== "grid") search.set("view", values.view);
    if (values.search === "1") search.set("search", "1");
    if (values.page && values.page !== "1") search.set("page", values.page);
    const suffix = search.toString();
    return `/bo-suu-tap/${collectionId}/${seriesId}${suffix ? `?${suffix}` : ""}`;
  };
  const addHref = `/them-card?collectionId=${collectionId}&seriesId=${seriesId}`;

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <RecentViewTracker
        userId={session.user.id}
        record={{
          type: "series",
          id: series.id,
          title: series.name,
          href: `/bo-suu-tap/${collectionId}/${series.id}`,
          image: series.coverImageUrl,
        }}
      />
      <main className="mx-auto min-h-screen max-w-5xl px-4 pb-28 sm:px-6 lg:pb-10">
        <header className="relative z-30 border-b border-app-border bg-app-bg pt-3 lg:mt-4 lg:rounded-2xl lg:border lg:px-4">
          <div className="flex h-12 items-center gap-2">
            <BackButton
              href={`/bo-suu-tap/${collectionId}`}
              label="Quay lại"
            />
            <h1 className="min-w-0 flex-1 truncate text-[15px] font-bold text-primary">
              {series.name}
            </h1>
            <Link
              href={queryHref({ search: searchOpen ? undefined : "1" })}
              aria-label="Tìm kiếm"
              className={`grid h-10 w-10 place-items-center rounded-xl border border-app-border bg-panel ${searchOpen ? "text-accent" : "text-secondary"}`}
            >
              <Search size={20} />
            </Link>
            <EditCategoryDialog
              collections={[series.parent]}
              category={series}
              defaultOpen={editOpen}
              trigger="header-icon"
            />
          </div>
          {searchOpen && (
            <form className="flex gap-2 pb-3 pt-2">
              <UnifiedSearchAutocomplete
                defaultValue={q}
                placeholder="Tìm card, bộ sưu tập hoặc series..."
                autoFocus
                collectionId={collectionId}
                seriesId={seriesId}
              />
              {itemType !== "ALL" && (
                <input type="hidden" name="itemType" value={itemType} />
              )}
              {sort !== "newest" && (
                <input type="hidden" name="sort" value={sort} />
              )}
              {view !== "grid" && (
                <input type="hidden" name="view" value={view} />
              )}
              <input type="hidden" name="search" value="1" />
              <button className="rounded-xl bg-violet-600 px-4 text-xs font-bold text-white">
                Tìm
              </button>
            </form>
          )}
          <nav
            id="series-filters"
            aria-label="Loại thẻ hoặc sản phẩm"
            className="flex scroll-mt-24 gap-7 overflow-x-auto pt-2 text-[13px] sm:justify-center"
          >
            {uiItemTypes.map((type) => (
              <Link
                key={type}
                href={queryHref({ itemType: type })}
                className={`relative shrink-0 pb-3 ${itemType === type ? "font-bold text-accent after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-violet-500" : "text-muted hover:text-secondary"}`}
              >
                {typeLabels[type]}
              </Link>
            ))}
          </nav>
        </header>

        <section className="mt-4 flex items-center justify-between gap-3">
          {/* Menu client tự đóng khi click ngoài hoặc nhấn Escape. */}
          <SortMenu
            currentLabel={sortLabels[sort]}
            options={sortOptions.map((option) => ({
              value: option,
              label: sortLabels[option],
              href: queryHref({ sort: option }),
            }))}
          />
          <div className="flex rounded-xl border border-app-border bg-panel p-1 text-xs">
            <Link
              href={queryHref({ view: "grid" })}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${view === "grid" ? "bg-violet-500/10 text-accent" : "text-muted"}`}
            >
              <Grid2X2 size={15} />
              Lưới
            </Link>
            <Link
              href={queryHref({ view: "list" })}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${view === "list" ? "bg-violet-500/10 text-accent" : "text-muted"}`}
            >
              <List size={16} />
              Danh sách
            </Link>
          </div>
        </section>

        <section
          id="series-info"
          className="mt-5 scroll-mt-52 overflow-hidden rounded-3xl border border-media-border bg-gradient-to-br from-[#151d3b] to-[#0c1125] p-5 sm:p-7"
        >
          <div className="flex gap-4">
            <div className="grid h-24 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-violet-950 text-accent-text">
              {series.coverImageUrl ? (
                <img
                  src={series.coverImageUrl}
                  alt={series.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Sparkles />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-violet-300">
                Series / Bộ
              </p>
              <h2 className="mt-1 text-2xl font-black text-on-media">
                {series.name}
              </h2>
              {series.description && (
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-on-media-muted">
                  {series.description}
                </p>
              )}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-media-border rounded-2xl bg-white/5 py-3 text-center">
            <Metric
              onMedia
              label="Số lượng"
              value={
                series.targetItemCount
                  ? `${ownedCount}/${series.targetItemCount}`
                  : String(ownedCount)
              }
            />
            <Metric onMedia label="Giá trị" value={formatVnd(totalValue)} />
            <Metric
              onMedia
              label="Hoàn thành"
              value={completion === null ? "—" : `${completion}%`}
            />
          </div>
        </section>

        <p className="mt-5 text-xs text-muted">
          {ownedCount} thẻ/sản phẩm · {totalGroups} nhóm
        </p>
        {pagedItems.length ? (
          view === "grid" ? (
            <section className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
              {pagedItems.map((item) => (
                <ItemGrid
                  key={`${item.card.id}-${item.condition}-${item.itemType}-${item.costPrice}`}
                  item={item}
                />
              ))}
            </section>
          ) : (
            <section className="mt-3 space-y-2">
              {pagedItems.map((item) => (
                <article
                  key={item.id}
                  className="relative flex gap-3 rounded-2xl border border-app-border bg-surface p-2.5"
                >
                  <Link
                    href={`/the/${item.card.id}`}
                    aria-label={`Xem chi tiết ${item.card.name}`}
                    className="absolute inset-0 z-[1] rounded-2xl"
                  />
                  <div className="relative h-24 w-[68px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-violet-950 to-slate-950">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.card.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-muted">
                        <ImageIcon size={24} />
                      </div>
                    )}
                    <FavoriteButton
                      id={item.card.id}
                      type="card"
                      source={item.favoriteSource}
                      compact
                      className="absolute bottom-1 left-1 z-10"
                    />
                  </div>
                  <div className="min-w-0 flex-1 py-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="truncate text-sm font-black text-primary">
                        {item.card.name}
                      </h2>
                      <div className="flex shrink-0 gap-1">
                        <span
                          className={`rounded-md px-2 py-1 text-[9px] font-black text-white ${
                            item.soldOut ? "bg-slate-500" : "bg-violet-600"
                          }`}
                        >
                          {item.soldOut ? "Đã bán hết" : `x${item.quantity}`}
                        </span>
                        <span className="rounded-md bg-black/70 px-2 py-1 text-[9px] font-black text-on-media-muted">
                          {item.condition}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted">
                      {item.card.cardNumber ||
                        item.card.setName ||
                        item.card.rarity ||
                        item.itemType}
                    </p>
                    <p className="mt-2 text-[10px] font-bold text-secondary">
                      {item.soldOut
                        ? "Đã bán hết"
                        : `Số lượng: ${item.quantity}`}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-black text-accent-text">
                        {formatVnd(item.costPrice)}
                      </span>
                      <Package size={15} className="text-muted" />
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )
        ) : (
          <section className="mt-8 rounded-3xl border border-dashed border-app-border bg-surface px-5 py-12 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-500/10 text-accent-text">
              <Sparkles />
            </div>
            <h2 className="mt-4 text-base font-black text-primary">
              {q || itemType !== "ALL"
                ? "Không tìm thấy thẻ/sản phẩm phù hợp"
                : "Series chưa có thẻ/sản phẩm"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted">
              {q || itemType !== "ALL"
                ? "Thử thay đổi từ khóa hoặc bộ lọc để xem thêm kết quả."
                : "Thêm card đầu tiên để bắt đầu theo dõi series này."}
            </p>
          </section>
        )}
        {totalPages > 1 && (
          <nav
            aria-label="Phân trang"
            className="mt-7 flex flex-wrap justify-center gap-2"
          >
            <Link
              href={queryHref({ page: String(Math.max(1, page - 1)) })}
              className={`rounded-lg border border-app-border px-3 py-2 text-xs ${page === 1 ? "pointer-events-none opacity-40" : "text-secondary"}`}
            >
              Trước
            </Link>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (number) => (
                <Link
                  key={number}
                  href={queryHref({ page: String(number) })}
                  className={`grid h-9 w-9 place-items-center rounded-lg text-xs ${number === page ? "bg-violet-600 font-bold text-white" : "border border-app-border text-secondary"}`}
                >
                  {number}
                </Link>
              ),
            )}
            <Link
              href={queryHref({ page: String(Math.min(totalPages, page + 1)) })}
              className={`rounded-lg border border-app-border px-3 py-2 text-xs ${page === totalPages ? "pointer-events-none opacity-40" : "text-secondary"}`}
            >
              Sau
            </Link>
          </nav>
        )}
        <Link
          href={addHref}
          className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-black text-white shadow-xl shadow-violet-950/50 lg:bottom-6 lg:right-6"
        >
          <Plus size={19} />
          <span className="hidden sm:inline">Thêm thẻ/sản phẩm</span>
          <span className="sm:hidden">Thêm mới</span>
        </Link>
      </main>
    </AppShell>
  );
}

type ItemGroup = Awaited<
  ReturnType<typeof paginateInventoryGroups<{
    card: {
      select: {
        id: true;
        name: true;
        cardNumber: true;
        rarity: true;
        setName: true;
        favorites: { where: { userId: string }; select: { id: true } };
      };
    };
  }>>
>["groups"][number]["item"] & {
  quantity: number;
  soldOut: boolean;
  favoriteSource: "explicit" | "inherited" | "none";
};

function QuantityBadge({
  quantity,
  soldOut,
  compact = false,
}: {
  quantity: number;
  soldOut: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={`rounded font-black text-white ${
        soldOut ? "bg-slate-500" : "bg-violet-600"
      } ${compact ? "px-1.5 py-0.5 text-[8px] sm:text-[9px]" : "px-1.5 py-0.5 text-[9px]"}`}
    >
      {soldOut ? "Đã bán hết" : `x${quantity}`}
    </span>
  );
}

function ItemGrid({ item }: { item: ItemGroup }) {
  return (
    <article className="relative overflow-hidden rounded-lg border border-app-border bg-surface sm:rounded-xl">
      <Link
        href={`/the/${item.card.id}`}
        aria-label={`Xem chi tiết ${item.card.name}`}
        className="absolute inset-0 z-[1] rounded-lg sm:rounded-xl"
      />
      <div className="relative aspect-[2.5/3.5] bg-gradient-to-br from-violet-950 to-slate-950">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.card.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-muted">
            <ImageIcon size={30} />
          </div>
        )}
        <FavoriteButton
          id={item.card.id}
          type="card"
          source={item.favoriteSource}
          compact
          className="absolute left-1 top-1 z-10 sm:left-2 sm:top-2"
        />
        <div className="absolute right-1 top-1 flex flex-col items-end gap-1 sm:right-2 sm:top-2">
          <QuantityBadge
            quantity={item.quantity}
            soldOut={item.soldOut}
            compact
          />
          <span className="rounded bg-black/65 px-1.5 py-0.5 text-[8px] font-black text-on-media">
            {item.condition}
          </span>
        </div>
      </div>
      <div className="p-1.5 sm:p-2.5">
        <h2 className="truncate text-[11px] font-black sm:text-sm text-primary">
          {item.card.name}
        </h2>
        <p className="mt-1 truncate text-[10px] text-muted">
          {item.card.cardNumber || item.card.rarity || item.itemType}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-black text-accent-text">
            {formatVnd(item.costPrice)}
          </span>
          <Package size={12} className="text-muted" />
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  onMedia = false,
}: {
  label: string;
  value: string;
  onMedia?: boolean;
}) {
  return (
    <div className="min-w-0 px-2">
      <p
        className={`truncate text-sm font-black ${onMedia ? "text-on-media" : "text-primary"}`}
      >
        {value}
      </p>
      <p
        className={`mt-1 text-[9px] uppercase tracking-wide ${onMedia ? "text-on-media-muted" : "text-muted"}`}
      >
        {label}
      </p>
    </div>
  );
}
