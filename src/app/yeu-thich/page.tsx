import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Grid2X2,
  Heart,
  ImageIcon,
  Layers3,
  List,
  Package,
  Sparkles,
} from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { UnifiedSearchAutocomplete } from "@/components/unified-search-autocomplete";
import { SortMenu } from "@/components/sort-menu";
import { FavoriteButton } from "@/components/favorite-button";
import { formatVnd } from "@/lib/format";
import {
  favoriteSource,
  getFavoriteContext,
  type FavoriteSource,
} from "@/lib/favorites";
import { prisma } from "@/lib/prisma";

const tabs = ["ALL", "CARD", "PRODUCT", "COLLECTION"] as const;
const sorts = ["newest", "name", "value"] as const;
const views = ["grid", "list"] as const;
type Tab = (typeof tabs)[number];
type Query = {
  q?: string;
  filter?: string;
  sort?: string;
  view?: string;
  page?: string;
};
const tabLabels = {
  ALL: "Tất cả",
  CARD: "Thẻ bài",
  PRODUCT: "Sản phẩm",
  COLLECTION: "Theo bộ sưu tập",
} as const;
const sortLabels = {
  newest: "Mới nhất",
  name: "Tên A–Z",
  value: "Giá trị cao",
} as const;
const PAGE_SIZE = 18;

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  const query = await searchParams;
  const q = query.q?.trim() ?? "";
  const filter: Tab = tabs.includes(query.filter as Tab)
    ? (query.filter as Tab)
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
  const context = await getFavoriteContext(session.user.id);
  const favoriteRootIds = [...context.favoriteRootIds];
  const explicitIds = [...context.explicitCardIds];
  const hasFavoriteScope =
    explicitIds.length > 0 || favoriteRootIds.length > 0;

  const cards = hasFavoriteScope
    ? await prisma.card.findMany({
        where: {
          userId: session.user.id,
          OR: [
            ...(explicitIds.length ? [{ id: { in: explicitIds } }] : []),
            ...(favoriteRootIds.length
              ? [
                  { categoryId: { in: favoriteRootIds } },
                  { category: { parentId: { in: favoriteRootIds } } },
                ]
              : []),
          ],
          ...(q
            ? {
                AND: [
                  {
                    OR: [
                      { name: { contains: q, mode: "insensitive" as const } },
                      {
                        cardNumber: {
                          contains: q,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        setName: { contains: q, mode: "insensitive" as const },
                      },
                      {
                        category: {
                          name: {
                            contains: q,
                            mode: "insensitive" as const,
                          },
                        },
                      },
                      {
                        category: {
                          parent: {
                            name: {
                              contains: q,
                              mode: "insensitive" as const,
                            },
                          },
                        },
                      },
                    ],
                  },
                ],
              }
            : {}),
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              parentId: true,
              parent: { select: { id: true, name: true } },
            },
          },
          inventoryItems: {
            where: { userId: session.user.id, status: "AVAILABLE" },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              costPrice: true,
              itemType: true,
              condition: true,
              imageUrl: true,
              createdAt: true,
            },
          },
          favorites: {
            where: { userId: session.user.id },
            select: { createdAt: true },
          },
        },
        take: 2000,
      })
    : [];
  const models = cards.map((card) => {
    const available = card.inventoryItems;
    const latest = available[0];
    const itemTypes = new Set(available.map((item) => item.itemType));
    const type =
      itemTypes.has("SINGLE_CARD") || !available.length ? "CARD" : "PRODUCT";
    const source = favoriteSource(card, context, card.id);
    const inherited = Boolean(
      (card.category?.parentId ?? card.categoryId) &&
      context.favoriteRootIds.has(
        card.category?.parentId ?? card.categoryId ?? "",
      ),
    );
    const root =
      card.category?.parent ?? (card.category?.parentId ? null : card.category);
    const series = card.category?.parentId ? card.category : null;
    return {
      card,
      latest,
      quantity: available.length,
      value: available.reduce((n, item) => n + item.costPrice, 0),
      type,
      source,
      inherited,
      root,
      series,
      favoriteAt: card.favorites[0]?.createdAt ?? card.createdAt,
    };
  });
  const counts = {
    ALL: models.length,
    CARD: models.filter((x) => x.type === "CARD").length,
    PRODUCT: models.filter((x) => x.type === "PRODUCT").length,
    COLLECTION: models.length,
  };
  const explicitCount = models.filter((x) => x.source === "explicit").length;
  const inheritedCount = models.filter((x) => x.inherited).length;
  const filtered = models
    .filter(
      (x) => filter === "ALL" || filter === "COLLECTION" || x.type === filter,
    )
    .sort((a, b) =>
      sort === "name"
        ? a.card.name.localeCompare(b.card.name, "vi")
        : sort === "value"
          ? b.value - a.value
          : b.favoriteAt.getTime() - a.favoriteAt.getTime(),
    );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const groups = new Map<
    string,
    {
      id: string;
      name: string;
      series: Map<string, { id: string; name: string; items: typeof visible }>;
    }
  >();
  for (const item of visible) {
    const rootId = item.root?.id ?? "orphan";
    const group = groups.get(rootId) ?? {
      id: rootId,
      name: item.root?.name ?? "Chưa phân loại",
      series: new Map(),
    };
    const seriesId = item.series?.id ?? "direct";
    const section = group.series.get(seriesId) ?? {
      id: seriesId,
      name: item.series?.name ?? "Card trực thuộc",
      items: [],
    };
    section.items.push(item);
    group.series.set(seriesId, section);
    groups.set(rootId, group);
  }
  const href = (next: Partial<Query>, reset = true) => {
    const values = { q, filter, sort, view, page: String(page), ...next };
    if (reset && next.page === undefined) values.page = "1";
    const p = new URLSearchParams();
    if (values.q) p.set("q", values.q);
    if (values.filter && values.filter !== "ALL")
      p.set("filter", values.filter);
    if (values.sort && values.sort !== "newest") p.set("sort", values.sort);
    if (values.view && values.view !== "grid") p.set("view", values.view);
    if (values.page && values.page !== "1") p.set("page", values.page);
    return `/yeu-thich${p.size ? `?${p}` : ""}`;
  };

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <main className="mx-auto min-h-screen max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-10">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-primary">
                Danh sách yêu thích
              </h1>
              <Heart
                size={19}
                className="text-violet-500"
                fill="currentColor"
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              Những card bạn yêu thích riêng hoặc từ bộ sưu tập.
            </p>
          </div>
        </header>
        <form className="mt-5 flex gap-2">
          <UnifiedSearchAutocomplete
            defaultValue={q}
            placeholder="Tìm card, bộ sưu tập hoặc series..."
          />
          {filter !== "ALL" && (
            <input type="hidden" name="filter" value={filter} />
          )}{" "}
          {sort !== "newest" && (
            <input type="hidden" name="sort" value={sort} />
          )}{" "}
          {view !== "grid" && <input type="hidden" name="view" value={view} />}
          <button className="rounded-xl bg-violet-600 px-4 text-xs font-bold text-white">
            Tìm
          </button>
        </form>
        <section className="mt-4 grid grid-cols-4 divide-x divide-app-border overflow-hidden rounded-2xl border border-app-border bg-surface py-4 text-center">
          <Stat
            icon={<Heart size={15} />}
            label="Tổng yêu thích"
            value={models.length}
          />
          <Stat
            icon={<Sparkles size={15} />}
            label="Yêu thích riêng"
            value={explicitCount}
          />
          <Stat
            icon={<Layers3 size={15} />}
            label="Từ bộ sưu tập"
            value={inheritedCount}
          />
          <Stat
            icon={<Package size={15} />}
            label="Bộ sưu tập đã thích"
            value={favoriteRootIds.length}
          />
        </section>
        <nav className="mt-5 flex gap-6 overflow-x-auto border-b border-app-border text-xs">
          {tabs.map((tab) => (
            <Link
              key={tab}
              href={href({ filter: tab })}
              className={`shrink-0 border-b-2 pb-3 ${filter === tab ? "border-violet-500 font-bold text-accent" : "border-transparent text-muted"}`}
            >
              {tabLabels[tab]}{" "}
              <span className="ml-1 rounded bg-panel px-1.5 py-0.5 text-[9px]">
                {counts[tab]}
              </span>
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
              href: href({ sort: option }),
            }))}
          />
          <div className="flex rounded-xl border border-app-border bg-panel p-1">
            <Link
              aria-label="Dạng lưới"
              href={href({ view: "grid" })}
              className={`rounded-lg p-2 ${view === "grid" ? "bg-violet-500/15 text-accent" : "text-muted"}`}
            >
              <Grid2X2 size={16} />
            </Link>
            <Link
              aria-label="Dạng danh sách"
              href={href({ view: "list" })}
              className={`rounded-lg p-2 ${view === "list" ? "bg-violet-500/15 text-accent" : "text-muted"}`}
            >
              <List size={16} />
            </Link>
          </div>
        </section>
        {visible.length ? (
          <div className="mt-5 space-y-7">
            {[...groups.values()].map((group) => (
              <section
                key={group.id}
                className={
                  filter === "COLLECTION"
                    ? "rounded-3xl border border-app-border bg-surface p-3 sm:p-5"
                    : ""
                }
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-primary">{group.name}</h2>
                  {group.id !== "orphan" && (
                    <Link
                      href={`/bo-suu-tap/${group.id}`}
                      className="text-[10px] font-bold text-accent"
                    >
                      Xem bộ sưu tập ›
                    </Link>
                  )}
                </div>
                <div className="mt-3 space-y-5">
                  {[...group.series.values()].map((section) => (
                    <div key={section.id}>
                      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">
                        {section.name} · {section.items.length}
                      </h3>
                      <div
                        className={
                          view === "grid"
                            ? "grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6"
                            : "space-y-2"
                        }
                      >
                        {section.items.map((item) => (
                          <FavoriteCard
                            key={item.card.id}
                            item={item}
                            view={view}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section className="mt-8 rounded-3xl border border-dashed border-app-border bg-surface px-5 py-14 text-center">
            <Heart className="mx-auto text-violet-500" />
            <h2 className="mt-4 font-black text-primary">
              {q || filter !== "ALL"
                ? "Không tìm thấy card phù hợp"
                : "Chưa có card yêu thích"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted">
              Yêu thích một card riêng hoặc yêu thích toàn bộ card trong
              Collection để chúng xuất hiện tại đây.
            </p>
          </section>
        )}
        {totalPages > 1 && (
          <nav className="mt-8 flex flex-wrap justify-center gap-2">
            <Link
              href={href({ page: String(Math.max(1, page - 1)) }, false)}
              className={`rounded-lg border border-app-border px-3 py-2 text-xs ${page === 1 ? "pointer-events-none opacity-40" : "text-secondary"}`}
            >
              Trước
            </Link>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={href({ page: String(n) }, false)}
                className={`grid h-9 w-9 place-items-center rounded-lg text-xs ${n === page ? "bg-violet-600 font-bold text-white" : "border border-app-border text-secondary"}`}
              >
                {n}
              </Link>
            ))}
            <Link
              href={href(
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

type Model = {
  card: {
    id: string;
    name: string;
    cardNumber: string | null;
    setName: string | null;
    rarity: string | null;
    referenceImage: string | null;
  };
  latest:
    | {
        imageUrl: string | null;
        condition: string;
        itemType: string;
        costPrice: number;
      }
    | undefined;
  quantity: number;
  value: number;
  source: FavoriteSource;
};
function FavoriteCard({ item, view }: { item: Model; view: string }) {
  const image = item.latest?.imageUrl ?? item.card.referenceImage;
  if (view === "list")
    return (
      <article className="relative flex gap-3 rounded-2xl border border-app-border bg-surface p-2.5">
        <Link
          href={`/the/${item.card.id}`}
          aria-label={`Xem chi tiết ${item.card.name}`}
          className="absolute inset-0 z-[1] rounded-2xl"
        />
        <CardImage item={item} image={image} list />
        <div className="min-w-0 flex-1 py-1">
          <h3 className="truncate text-sm font-black text-primary">
            {item.card.name}
          </h3>
          <p className="mt-1 truncate text-[11px] text-muted">
            {item.card.cardNumber ||
              item.card.setName ||
              item.card.rarity ||
              item.latest?.itemType ||
              "Card"}
          </p>
          <p className="mt-2 text-[10px] text-secondary">
            {item.latest?.condition ?? "Chưa có tồn kho"} · Số lượng{" "}
            {item.quantity}
          </p>
          <p className="mt-2 text-sm font-black text-accent-text">
            {item.quantity ? formatVnd(item.value) : "0 ₫"}
          </p>
        </div>
      </article>
    );
  return (
    <article className="relative overflow-hidden rounded-lg border border-app-border bg-surface sm:rounded-xl">
      <Link
        href={`/the/${item.card.id}`}
        aria-label={`Xem chi tiết ${item.card.name}`}
        className="absolute inset-0 z-[1] rounded-lg sm:rounded-xl"
      />
      <CardImage item={item} image={image} />
      <div className="p-1.5 sm:p-2.5">
        <h3 className="truncate text-[11px] font-black text-primary sm:text-sm">
          {item.card.name}
        </h3>
        <p className="mt-1 truncate text-[9px] text-muted">
          {item.card.cardNumber ||
            item.card.setName ||
            item.latest?.itemType ||
            "Card"}
        </p>
        <div className="mt-1 flex gap-1">
          <span className="truncate rounded bg-violet-500/15 px-1 py-0.5 text-[8px] font-bold text-accent-text">
            {item.card.rarity || item.latest?.itemType || "CARD"}
          </span>
          {item.latest?.condition && (
            <span className="truncate rounded bg-panel px-1 py-0.5 text-[8px] text-muted">
              {item.latest.condition}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="truncate text-[10px] font-black text-accent-text sm:text-xs">
            {item.quantity ? formatVnd(item.value) : "0 ₫"}
          </span>
          <span
            className={`text-[8px] font-bold ${item.quantity ? "text-muted" : "text-amber-500"}`}
          >
            {item.quantity ? `x${item.quantity}` : "Hết hàng"}
          </span>
        </div>
      </div>
    </article>
  );
}
function CardImage({
  item,
  image,
  list = false,
}: {
  item: Model;
  image: string | null;
  list?: boolean;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-gradient-to-br from-violet-950 to-slate-950 ${list ? "h-24 w-[68px] rounded-xl" : "aspect-[2.5/3.5]"}`}
    >
      {image ? (
        <img
          src={image}
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
        source={item.source}
        compact
        className="absolute right-1 top-1 z-10"
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
  value: number;
}) {
  return (
    <div className="min-w-0 px-1">
      <div className="flex items-center justify-center gap-1 text-accent-text">
        {icon}
        <strong className="text-sm text-primary">{value}</strong>
      </div>
      <p className="mt-1 truncate text-[8px] text-muted sm:text-[10px]">
        {label}
      </p>
    </div>
  );
}
