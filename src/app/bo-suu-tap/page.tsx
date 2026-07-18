import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, Boxes, Grid2X2, List, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { UnifiedSearchAutocomplete } from "@/components/unified-search-autocomplete";
import { SortMenu } from "@/components/sort-menu";
import { formatVnd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { CollectionCreateDialog } from "./collection-create-dialog";
import { DeleteCategoryButton } from "./delete-category-button";

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
  "value-desc",
  "value-asc",
] as const;
const views = ["grid", "list"] as const;
const PAGE_SIZE = 12;
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
  "value-desc": "Giá trị cao",
  "value-asc": "Giá trị thấp",
} as const;

export default async function CollectionsPage({
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

  const needsValueSort = sort === "value-desc" || sort === "value-asc";
  const searchClause = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { description: { contains: q, mode: "insensitive" as const } },
          {
            children: {
              some: {
                userId: session.user.id,
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  {
                    description: {
                      contains: q,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              },
            },
          },
        ],
      }
    : null;
  const itemTypeClause =
    itemType !== "ALL"
      ? {
          OR: [
            {
              cards: {
                some: {
                  inventoryItems: {
                    some: {
                      userId: session.user.id,
                      status: "AVAILABLE" as const,
                      itemType,
                    },
                  },
                },
              },
            },
            {
              children: {
                some: {
                  userId: session.user.id,
                  cards: {
                    some: {
                      inventoryItems: {
                        some: {
                          userId: session.user.id,
                          status: "AVAILABLE" as const,
                          itemType,
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        }
      : null;

  const collectionWhere = {
    userId: session.user.id,
    parentId: null as null,
    ...(searchClause && itemTypeClause
      ? { AND: [searchClause, itemTypeClause] }
      : (searchClause ?? itemTypeClause ?? {})),
  };

  const collectionInclude = {
    _count: { select: { children: true, cards: true } },
    cards: {
      select: {
        inventoryItems: {
          where: { userId: session.user.id, status: "AVAILABLE" as const },
          select: { costPrice: true, itemType: true },
        },
      },
    },
    children: {
      where: { userId: session.user.id },
      select: {
        targetItemCount: true,
        cards: {
          select: {
            inventoryItems: {
              where: {
                userId: session.user.id,
                status: "AVAILABLE" as const,
              },
              select: { costPrice: true, itemType: true },
            },
          },
        },
      },
    },
  } as const;

  const [collectionCount, inventoryStats, collectionOptions] =
    await Promise.all([
      prisma.category.count({ where: collectionWhere }),
      prisma.inventoryItem.aggregate({
        where: {
          userId: session.user.id,
          status: "AVAILABLE",
          ...(itemType === "ALL" ? {} : { itemType }),
        },
        _count: true,
        _sum: { costPrice: true },
      }),
      prisma.category.findMany({
        where: { userId: session.user.id, parentId: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(collectionCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const collections = needsValueSort
    ? await prisma.category.findMany({
        where: collectionWhere,
        include: collectionInclude,
      })
    : await prisma.category.findMany({
        where: collectionWhere,
        include: collectionInclude,
        orderBy:
          sort === "oldest"
            ? { createdAt: "asc" }
            : sort === "name-asc"
              ? { name: "asc" }
              : { updatedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      });

  const enrichedAll = collections.map((collection) => {
    const items = [
      ...collection.cards.flatMap((card) => card.inventoryItems),
      ...collection.children.flatMap((series) =>
        series.cards.flatMap((card) => card.inventoryItems),
      ),
    ];
    return {
      collection,
      items,
      value: items.reduce((sum, item) => sum + item.costPrice, 0),
    };
  });
  const visible = needsValueSort
    ? enrichedAll
        .sort((a, b) =>
          sort === "value-desc" ? b.value - a.value : a.value - b.value,
        )
        .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : enrichedAll;
  const totalValue = inventoryStats._sum.costPrice ?? 0;
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
    return `/bo-suu-tap${params.size ? `?${params}` : ""}`;
  };

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-primary">Bộ sưu tập</h1>
            <p className="mt-1 text-xs text-muted">
              Tất cả card và sản phẩm bạn đang sưu tầm.
            </p>
          </div>
          <CollectionCreateDialog
            collections={collectionOptions}
          />
        </header>
        <section className="mt-5 grid grid-cols-3 rounded-2xl border border-app-border bg-surface p-3 sm:p-4">
          <Stat
            icon={<Boxes size={19} />}
            label="Số mục đang có"
            value={inventoryStats._count}
          />
          <Stat
            icon={<Grid2X2 size={19} />}
            label="Bộ sưu tập"
            value={collectionCount}
          />
          <Stat
            icon={<Archive size={19} />}
            label="Tổng giá trị"
            value={formatVnd(totalValue)}
          />
        </section>
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
        <nav className="mt-4 flex gap-6 overflow-x-auto border-b border-app-border text-xs font-bold">
          {itemTypes.map((type) => (
            <Link
              key={type}
              href={queryHref({ itemType: type })}
              className={`shrink-0 border-b-2 px-1 pb-3 ${itemType === type ? "border-violet-500 text-accent-text" : "border-transparent text-muted"}`}
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
        <p className="mt-4 text-xs text-muted">
          {collectionCount} bộ sưu tập phù hợp
        </p>
        {visible.length ? (
          <section
            className={
              view === "grid"
                ? "mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                : "mt-3 space-y-3"
            }
          >
            {visible.map(({ collection, items, value }) => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                count={items.length}
                value={value}
                view={view}
              />
            ))}
          </section>
        ) : (
          <section className="mt-5 rounded-2xl border border-dashed border-app-border bg-surface py-14 text-center">
            <Sparkles className="mx-auto text-accent-text" />
            <p className="mt-3 text-sm font-bold text-primary">
              Không tìm thấy bộ sưu tập phù hợp
            </p>
          </section>
        )}
        {totalPages > 1 && (
          <nav
            aria-label="Phân trang"
            className="mt-7 flex flex-wrap items-center justify-center gap-2"
          >
            <Link
              aria-disabled={page === 1}
              href={
                page > 1
                  ? queryHref({ page: String(page - 1) }, false)
                  : queryHref({ page: "1" }, false)
              }
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
              aria-disabled={page === totalPages}
              href={
                page < totalPages
                  ? queryHref({ page: String(page + 1) }, false)
                  : queryHref({ page: String(totalPages) }, false)
              }
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

type Collection = Awaited<
  ReturnType<
    typeof prisma.category.findMany<{
      include: {
        _count: { select: { children: true; cards: true } };
        cards: {
          select: {
            inventoryItems: {
              where: { userId: string; status: "AVAILABLE" };
              select: { costPrice: true; itemType: true };
            };
          };
        };
        children: {
          where: { userId: string };
          select: {
            targetItemCount: true;
            cards: {
              select: {
                inventoryItems: {
                  where: { userId: string; status: "AVAILABLE" };
                  select: { costPrice: true; itemType: true };
                };
              };
            };
          };
        };
      };
    }>
  >
>[number];
function CollectionCard({
  collection,
  count,
  value,
  view,
}: {
  collection: Collection;
  count: number;
  value: number;
  view: "grid" | "list";
}) {
  const card = (
    <>
      <div
        className={
          view === "grid"
            ? "relative aspect-[1.35/1] bg-gradient-to-br from-violet-800 to-slate-950"
            : "h-24 w-28 shrink-0 bg-gradient-to-br from-violet-800 to-slate-950 sm:w-40"
        }
      >
        {collection.coverImageUrl ? (
          <img
            src={collection.coverImageUrl}
            alt={collection.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="grid h-full place-items-center"
            style={{ backgroundColor: collection.accentColor ?? "#6d28d9" }}
          >
            <Sparkles className="text-on-media/80" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 p-3">
        <p className="truncate text-sm font-black text-primary">
          {collection.name}
        </p>
        {collection.description && (
          <p className="mt-1 line-clamp-1 text-[11px] text-muted">
            {collection.description}
          </p>
        )}
        <div className="mt-3 flex items-end justify-between gap-2">
          <p className="text-[10px] text-muted">
            {count} mục · {collection.children.length} series
          </p>
          <p className="shrink-0 text-[10px] font-bold text-accent-text">
            {formatVnd(value)}
          </p>
        </div>
      </div>
    </>
  );
  return (
    <div className="relative">
      <Link
        href={`/bo-suu-tap/${collection.id}`}
        className={`${view === "grid" ? "block overflow-hidden" : "flex overflow-hidden"} rounded-xl border border-app-border bg-surface transition hover:border-violet-400/60`}
      >
        {card}
      </Link>
      <DeleteCategoryButton
        id={collection.id}
        name={collection.name}
        kind="collection"
        hasContents={
          collection._count.children > 0 || collection._count.cards > 0
        }
      />
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-r border-app-border px-2 last:border-0 sm:px-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/15 text-accent-text">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[9px] text-muted">{label}</p>
        <p className="truncate text-sm font-black text-primary">{value}</p>
      </div>
    </div>
  );
}
