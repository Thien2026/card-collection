import Link from "next/link";
import { redirect } from "next/navigation";
import { Grid2X2, ImageIcon, List, Package, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { UnifiedSearchAutocomplete } from "@/components/unified-search-autocomplete";
import { SortMenu } from "@/components/sort-menu";
import { FavoriteButton } from "@/components/favorite-button";
import { formatVnd } from "@/lib/format";
import { paginateInventoryGroups } from "@/lib/inventory-groups";
import { prisma } from "@/lib/prisma";

const itemTypes = [
  "ALL",
  "SINGLE_CARD",
  "SEALED_PRODUCT",
  "ACCESSORY",
] as const;
const sorts = [
  "newest",
  "oldest",
  "name-asc",
  "price-desc",
  "price-asc",
] as const;
const views = ["grid", "list"] as const;
const PAGE_SIZE = 18;
type Query = {
  q?: string;
  itemType?: string;
  sort?: string;
  view?: string;
  page?: string;
};
type ItemType = (typeof itemTypes)[number];
const typeLabels = {
  ALL: "Tất cả",
  SINGLE_CARD: "Thẻ đơn",
  SEALED_PRODUCT: "Sealed",
  ACCESSORY: "Phụ kiện",
} as const;
const sortLabels = {
  newest: "Mới nhất",
  oldest: "Cũ nhất",
  "name-asc": "Tên A–Z",
  "price-desc": "Giá cao nhất",
  "price-asc": "Giá thấp nhất",
} as const;

export default async function RecentItemsPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const itemType: ItemType = itemTypes.includes(query.itemType as ItemType)
    ? (query.itemType as ItemType)
    : "ALL";
  const sort = sorts.includes(query.sort as (typeof sorts)[number])
    ? (query.sort as (typeof sorts)[number])
    : "newest";
  const view = views.includes(query.view as (typeof views)[number])
    ? (query.view as (typeof views)[number])
    : "grid";
  const requestedPage = /^\d+$/.test(query.page ?? "")
    ? Math.max(1, Number(query.page))
    : 1;
  const itemsWhere = {
    userId: session.user.id,
    status: "AVAILABLE" as const,
    ...(itemType === "ALL" ? {} : { itemType }),
    card: {
      userId: session.user.id,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { cardNumber: { contains: q, mode: "insensitive" as const } },
              { setName: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
  };
  const favoriteRoots = new Set(
    (
      await prisma.categoryFavorite.findMany({
        where: {
          userId: session.user.id,
          category: { parentId: null, userId: session.user.id },
        },
        select: { categoryId: true },
      })
    ).map((row) => row.categoryId),
  );
  const {
    groups: pageGroups,
    totalGroups,
    totalPages,
    page,
  } = await paginateInventoryGroups({
    where: itemsWhere,
    sort,
    page: requestedPage,
    pageSize: PAGE_SIZE,
    include: {
      card: {
        select: {
          id: true,
          name: true,
          cardNumber: true,
          rarity: true,
          setName: true,
          game: true,
          favorites: {
            where: { userId: session.user.id },
            select: { id: true },
          },
          category: { select: { id: true, parentId: true } },
        },
      },
    },
  });
  const ownedCount = await prisma.inventoryItem.count({ where: itemsWhere });
  const visible = pageGroups.map(({ item, quantity }) => ({
    ...item,
    quantity,
    favoriteSource:
      item.card.favorites.length > 0
        ? ("explicit" as const)
        : favoriteRoots.has(
              item.card.category?.parentId ?? item.card.category?.id ?? "",
            )
          ? ("inherited" as const)
          : ("none" as const),
  }));
  const queryHref = (next: Partial<Query>, resetPage = true) => {
    const values = { q, itemType, sort, view, page: String(page), ...next };
    if (resetPage && next.page === undefined) values.page = "1";
    const params = new URLSearchParams();
    if (values.q) params.set("q", values.q);
    if (values.itemType && values.itemType !== "ALL")
      params.set("itemType", values.itemType);
    if (values.sort && values.sort !== "newest")
      params.set("sort", values.sort);
    if (values.view && values.view !== "grid") params.set("view", values.view);
    if (values.page && values.page !== "1") params.set("page", values.page);
    return `/the-them-gan-day${params.size ? `?${params}` : ""}`;
  };
  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <main className="mx-auto min-h-screen max-w-5xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-10">
        <header>
          <h1 className="text-2xl font-black text-primary">Thẻ thêm gần đây</h1>
          <p className="mt-1 text-xs text-muted">
            {ownedCount} thẻ/sản phẩm khả dụng · {totalGroups} nhóm
          </p>
        </header>
        <form className="mt-5 flex gap-2">
          <UnifiedSearchAutocomplete
            defaultValue={q}
            placeholder="Tìm card, bộ sưu tập hoặc series..."
          />
          {itemType !== "ALL" && (
            <input type="hidden" name="itemType" value={itemType} />
          )}{" "}
          {sort !== "newest" && (
            <input type="hidden" name="sort" value={sort} />
          )}{" "}
          {view !== "grid" && <input type="hidden" name="view" value={view} />}
          <button className="rounded-xl bg-violet-600 px-4 text-xs font-bold text-white">
            Tìm
          </button>
        </form>
        <nav className="mt-4 flex gap-7 overflow-x-auto border-b border-app-border text-xs">
          {itemTypes.map((type) => (
            <Link
              key={type}
              href={queryHref({ itemType: type })}
              className={`shrink-0 border-b-2 pb-3 ${type === itemType ? "border-violet-500 font-bold text-accent" : "border-transparent text-muted"}`}
            >
              {typeLabels[type]}
            </Link>
          ))}
        </nav>
        <section className="mt-4 flex items-center justify-between gap-2">
          {/* Menu client tự đóng khi click ngoài hoặc nhấn Escape. */}
          <SortMenu
            currentLabel={sortLabels[sort]}
            options={sorts.map((option) => ({
              value: option,
              label: sortLabels[option],
              href: queryHref({ sort: option }),
            }))}
          />
          <div className="flex rounded-xl border border-app-border bg-panel p-1">
            <Link
              aria-label="Dạng lưới"
              href={queryHref({ view: "grid" })}
              className={`rounded-lg p-2 ${view === "grid" ? "bg-violet-500/15 text-accent" : "text-muted"}`}
            >
              <Grid2X2 size={16} />
            </Link>
            <Link
              aria-label="Dạng danh sách"
              href={queryHref({ view: "list" })}
              className={`rounded-lg p-2 ${view === "list" ? "bg-violet-500/15 text-accent" : "text-muted"}`}
            >
              <List size={16} />
            </Link>
          </div>
        </section>
        {visible.length ? (
          view === "grid" ? (
            <section className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
              {visible.map((item) => (
                <ItemGrid key={groupKey(item)} item={item} />
              ))}
            </section>
          ) : (
            <section className="mt-4 space-y-2">
              {visible.map((item) => (
                <ItemList key={groupKey(item)} item={item} />
              ))}
            </section>
          )
        ) : (
          <section className="mt-8 rounded-3xl border border-dashed border-app-border bg-surface py-14 text-center">
            <Sparkles className="mx-auto text-accent-text" />
            <p className="mt-3 text-sm font-bold text-primary">
              Không tìm thấy thẻ/sản phẩm phù hợp
            </p>
          </section>
        )}
        {totalPages > 1 && (
          <nav className="mt-7 flex flex-wrap justify-center gap-2">
            <Link
              href={queryHref({ page: String(Math.max(1, page - 1)) }, false)}
              className={`rounded-lg border border-app-border px-3 py-2 text-xs ${page === 1 ? "pointer-events-none opacity-40" : "text-secondary"}`}
            >
              Trước
            </Link>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(
              (number) => (
                <Link
                  key={number}
                  href={queryHref({ page: String(number) }, false)}
                  className={`grid h-9 w-9 place-items-center rounded-lg text-xs ${number === page ? "bg-violet-600 font-bold text-white" : "border border-app-border text-secondary"}`}
                >
                  {number}
                </Link>
              ),
            )}
            <Link
              href={queryHref(
                { page: String(Math.min(totalPages, page + 1)) },
                false,
              )}
              className={`rounded-lg border border-app-border px-3 py-2 text-xs ${page === totalPages ? "pointer-events-none opacity-40" : "text-secondary"}`}
            >
              Sau
            </Link>
          </nav>
        )}
      </main>
    </AppShell>
  );
}

type ItemGroup = Awaited<
  ReturnType<
    typeof paginateInventoryGroups<{
      card: {
        select: {
          id: true;
          name: true;
          cardNumber: true;
          rarity: true;
          setName: true;
          game: true;
          category: { select: { id: true; parentId: true } };
          favorites: { where: { userId: string }; select: { id: true } };
        };
      };
    }>
  >
>["groups"][number]["item"] & {
  quantity: number;
  favoriteSource: "explicit" | "inherited" | "none";
};
const groupKey = (item: ItemGroup) =>
  `${item.cardId}-${item.condition}-${item.itemType}-${item.costPrice}`;
function ItemImage({ item }: { item: ItemGroup }) {
  return (
    <>
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.card.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full place-items-center text-muted">
          <ImageIcon size={26} />
        </div>
      )}
      <FavoriteButton
        id={item.card.id}
        type="card"
        source={item.favoriteSource}
        compact
        className="absolute bottom-1 left-1 z-10"
      />
      <div className="absolute right-1 top-1 flex flex-col items-end gap-1">
        <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[9px] font-black text-white">
          x{item.quantity}
        </span>
        <span className="rounded bg-black/70 px-1.5 py-0.5 text-[8px] font-black text-on-media">
          {item.condition}
        </span>
      </div>
    </>
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
        <ItemImage item={item} />
      </div>
      <div className="p-1.5 sm:p-2.5">
        <h2 className="truncate text-[11px] font-black text-primary sm:text-sm">
          {item.card.name}
        </h2>
        <p className="mt-1 truncate text-[9px] text-muted">
          {item.card.cardNumber || item.card.setName || item.itemType}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] font-black text-accent-text sm:text-xs">
            {formatVnd(item.costPrice)}
          </span>
          <Package size={12} className="text-muted" />
        </div>
      </div>
    </article>
  );
}
function ItemList({ item }: { item: ItemGroup }) {
  return (
    <article className="relative flex gap-3 rounded-2xl border border-app-border bg-surface p-2.5">
      <Link
        href={`/the/${item.card.id}`}
        aria-label={`Xem chi tiết ${item.card.name}`}
        className="absolute inset-0 z-[1] rounded-2xl"
      />
      <div className="relative h-24 w-[68px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-violet-950 to-slate-950">
        <ItemImage item={item} />
      </div>
      <div className="min-w-0 flex-1 py-1">
        <h2 className="truncate text-sm font-black text-primary">
          {item.card.name}
        </h2>
        <p className="mt-1 truncate text-[11px] text-muted">
          {item.card.cardNumber ||
            item.card.setName ||
            item.card.game ||
            item.itemType}
        </p>
        <p className="mt-2 text-[10px] font-bold text-secondary">
          Số lượng: {item.quantity}
        </p>
        <p className="mt-2 text-sm font-black text-accent-text">
          {formatVnd(item.costPrice)}
        </p>
      </div>
    </article>
  );
}
