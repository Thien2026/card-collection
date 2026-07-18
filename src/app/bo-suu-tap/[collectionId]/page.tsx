import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ChevronRight,
  ClipboardList,
  Grid2X2,
  Package,
  Sparkles,
} from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { formatVnd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { DeleteCategoryButton } from "../delete-category-button";
import { FavoriteButton } from "@/components/favorite-button";
import { RecentViewTracker } from "@/components/recent-view";
import {
  CollectionCreateDialog,
  EditCategoryDialog,
} from "../collection-create-dialog";

export default async function CollectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ collectionId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  const [{ collectionId }, query] = await Promise.all([params, searchParams]);
  const collection = await prisma.category.findFirst({
    where: { id: collectionId, userId: session.user.id, parentId: null },
    include: {
      favorites: { where: { userId: session.user.id } },
      children: {
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
        include: {
          _count: { select: { cards: true } },
          cards: {
            include: {
              inventoryItems: {
                where: { userId: session.user.id, status: "AVAILABLE" },
                select: {
                  id: true,
                  costPrice: true,
                  itemType: true,
                  imageUrl: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
      cards: {
        include: {
          inventoryItems: {
            where: { userId: session.user.id, status: "AVAILABLE" },
            select: {
              id: true,
              costPrice: true,
              itemType: true,
              imageUrl: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  if (!collection) notFound();

  const collectionItems = collection.cards.flatMap((card) =>
    card.inventoryItems.map((item) => ({
      ...item,
      cardId: card.id,
      cardName: card.name,
      seriesName: null as string | null,
    })),
  );
  const allItems = [
    ...collectionItems,
    ...collection.children.flatMap((series) =>
      series.cards.flatMap((card) =>
        card.inventoryItems.map((item) => ({
          ...item,
          cardId: card.id,
          cardName: card.name,
          seriesName: series.name,
        })),
      ),
    ),
  ];
  const totalValue = allItems.reduce((sum, item) => sum + item.costPrice, 0);
  const completion = collection.targetItemCount
    ? Math.min(
        100,
        Math.round((allItems.length / collection.targetItemCount) * 100),
      )
    : null;
  const typeCounts = {
    SINGLE_CARD: allItems.filter((item) => item.itemType === "SINGLE_CARD")
      .length,
    SEALED_PRODUCT: allItems.filter(
      (item) => item.itemType === "SEALED_PRODUCT",
    ).length,
    ACCESSORY: allItems.filter((item) => item.itemType === "ACCESSORY").length,
  };

  const seriesIds = collection.children.map((series) => series.id);
  const categoryIds = [collection.id, ...seriesIds];
  const [activityAdds, activitySales] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: {
        userId: session.user.id,
        card: { userId: session.user.id, categoryId: { in: categoryIds } },
      },
      select: {
        createdAt: true,
        imageUrl: true,
        card: {
          select: {
            id: true,
            name: true,
            categoryId: true,
            category: { select: { id: true, name: true, parentId: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.saleItem.findMany({
      where: {
        sale: {
          createdById: session.user.id,
          status: "COMPLETED",
        },
        inventoryItem: {
          userId: session.user.id,
          card: { userId: session.user.id, categoryId: { in: categoryIds } },
        },
      },
      select: {
        soldPrice: true,
        inventoryItem: {
          select: {
            imageUrl: true,
            card: {
              select: {
                id: true,
                name: true,
                category: { select: { id: true, name: true, parentId: true } },
              },
            },
          },
        },
        sale: {
          select: {
            id: true,
            code: true,
            completedAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { sale: { completedAt: "desc" } },
      take: 80,
    }),
  ]);

  type Activity = {
    key: string;
    kind: "ADD" | "SALE";
    cardId: string;
    cardName: string;
    seriesName: string | null;
    imageUrl: string | null;
    at: Date;
    quantity: number;
    href: string;
  };

  const addGroups = new Map<string, Activity>();
  for (const item of activityAdds) {
    const day = item.createdAt.toISOString().slice(0, 10);
    const key = `add:${item.card.id}:${day}`;
    const seriesName =
      item.card.category?.parentId === collection.id
        ? item.card.category.name
        : null;
    const existing = addGroups.get(key);
    if (!existing) {
      addGroups.set(key, {
        key,
        kind: "ADD",
        cardId: item.card.id,
        cardName: item.card.name,
        seriesName,
        imageUrl: item.imageUrl,
        at: item.createdAt,
        quantity: 1,
        href: `/the/${item.card.id}`,
      });
      continue;
    }
    existing.quantity += 1;
    if (item.createdAt > existing.at) {
      existing.at = item.createdAt;
      existing.imageUrl = item.imageUrl ?? existing.imageUrl;
    }
  }

  const saleGroups = new Map<string, Activity>();
  for (const item of activitySales) {
    const soldAt = item.sale.completedAt ?? item.sale.updatedAt;
    const key = `sale:${item.sale.id}:${item.inventoryItem.card.id}`;
    const seriesName =
      item.inventoryItem.card.category?.parentId === collection.id
        ? item.inventoryItem.card.category.name
        : null;
    const existing = saleGroups.get(key);
    if (!existing) {
      saleGroups.set(key, {
        key,
        kind: "SALE",
        cardId: item.inventoryItem.card.id,
        cardName: item.inventoryItem.card.name,
        seriesName,
        imageUrl: item.inventoryItem.imageUrl,
        at: soldAt,
        quantity: 1,
        href: `/ban-hang/${item.sale.id}`,
      });
      continue;
    }
    existing.quantity += 1;
  }

  const recent = [...addGroups.values(), ...saleGroups.values()]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 3);

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <RecentViewTracker
        userId={session.user.id}
        record={{
          type: "collection",
          id: collection.id,
          title: collection.name,
          href: `/bo-suu-tap/${collection.id}`,
          image: collection.coverImageUrl,
        }}
      />
      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:py-10">
        <section className="relative overflow-hidden rounded-3xl border border-app-border bg-surface">
          <div className="absolute inset-x-0 top-0 h-52 bg-gradient-to-br from-violet-700 via-indigo-800 to-slate-950">
            {collection.bannerImageUrl || collection.coverImageUrl ? (
              <img
                src={
                  collection.bannerImageUrl ?? collection.coverImageUrl ?? ""
                }
                alt=""
                className="h-full w-full object-cover opacity-70"
              />
            ) : (
              <div
                className="h-full w-full"
                style={{ backgroundColor: collection.accentColor ?? "#6d28d9" }}
              />
            )}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface to-transparent" />
          </div>
          <div className="relative z-10 flex items-center justify-between p-4">
            <BackButton href="/bo-suu-tap" label="Quay lại bộ sưu tập" />
            <div className="flex gap-2">
              <FavoriteButton
                id={collection.id}
                type="category"
                initial={collection.favorites.length > 0}
                label="Yêu thích toàn bộ card"
              />
              <EditCategoryDialog
                collections={[{ id: collection.id, name: collection.name }]}
                category={collection}
                defaultOpen={query.edit === "1"}
                trigger="edit"
              />
            </div>
          </div>
          <div className="absolute left-5 top-32 z-20 grid h-24 w-20 place-items-center overflow-hidden rounded-xl border-4 border-surface bg-violet-700 shadow-xl">
            {collection.coverImageUrl ? (
              <img
                src={collection.coverImageUrl}
                alt={collection.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <Sparkles size={30} />
            )}
          </div>
          <div className="relative z-10 mt-20 min-h-24 px-5 pb-5 pl-[7.25rem]">
            <h1 className="text-xl font-black text-primary">
              {collection.name}
            </h1>
            <p className="mt-1 text-xs text-secondary">
              {collection.releaseYear
                ? `${collection.releaseYear} · Hiện tại`
                : "Đang sưu tầm"}
            </p>
          </div>
          <div
            className={`grid border-t border-app-border px-2 py-4 text-center ${completion === null ? "grid-cols-3" : "grid-cols-4"}`}
          >
            <Metric
              label="Tổng số mục"
              value={
                completion === null
                  ? allItems.length
                  : `${allItems.length}/${collection.targetItemCount}`
              }
            />
            {completion !== null && (
              <Metric label="Hoàn thành" value={`${completion}%`} />
            )}
            <Metric label="Giá trị" value={formatVnd(totalValue)} />
            <Metric label="Mục mới" value={recent.length} />
          </div>
          {completion !== null && (
            <div className="px-5 pb-5">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-violet-500"
                  style={{ width: `${completion}%` }}
                />
              </div>
            </div>
          )}
        </section>
        <section className="mt-4 grid grid-cols-3 rounded-2xl border border-app-border bg-surface p-2">
          <Quick
            href={`/bo-suu-tap/${collection.id}/series`}
            icon={<ClipboardList size={18} />}
            label="Danh sách"
            active
          />
          <Quick
            href={`/bo-suu-tap/${collection.id}/thong-ke`}
            icon={<BarChart3 size={18} />}
            label="Thống kê"
          />
          <EditCategoryDialog
            collections={[{ id: collection.id, name: collection.name }]}
            category={collection}
            trigger="settings"
          />
        </section>
        <section className="mt-7">
          <Header title="SERIES" href={`/bo-suu-tap/${collection.id}/series`} />
          <div className="mt-3 flex gap-3 overflow-x-auto pb-3">
            {collection.children.length === 0 ? (
              <div className="grid min-w-28 aspect-[2.5/3.5] place-items-center rounded-xl border border-dashed border-violet-400/40 bg-violet-500/5 p-3 text-center">
                <CollectionCreateDialog
                  collections={[{ id: collection.id, name: collection.name }]}
                  initialMode="series"
                  parentId={collection.id}
                />
              </div>
            ) : (
              collection.children.map((series) => {
                const items = series.cards.flatMap(
                  (card) => card.inventoryItems,
                );
                const completion = series.targetItemCount
                  ? Math.min(
                      100,
                      Math.round((items.length / series.targetItemCount) * 100),
                    )
                  : null;
                return (
                  <div className="relative min-w-28" key={series.id}>
                    <Link
                      href={`/bo-suu-tap/${collection.id}/${series.id}`}
                      className="relative block aspect-[2.5/3.5] overflow-hidden rounded-xl border border-app-border bg-violet-950"
                    >
                      {series.coverImageUrl ? (
                        <img
                          src={series.coverImageUrl}
                          alt={series.name}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundColor: series.accentColor ?? "#5b21b6",
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#080c1d] via-transparent to-transparent" />
                      <div className="absolute inset-x-2 bottom-2">
                        <p className="truncate text-[10px] font-black text-on-media">
                          {series.name}
                        </p>
                        {completion !== null ? (
                          <>
                            <p className="mt-1 text-[9px] text-on-media-muted">
                              {completion}%{" "}
                              <span className="float-right">
                                {items.length}/{series.targetItemCount}
                              </span>
                            </p>
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/20">
                              <div
                                className="h-full rounded-full bg-violet-400"
                                style={{ width: `${completion}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <p className="mt-1 text-[9px] text-on-media-muted">
                            {items.length} thẻ
                          </p>
                        )}
                      </div>
                    </Link>
                    <EditCategoryDialog
                      collections={[
                        { id: collection.id, name: collection.name },
                      ]}
                      category={series}
                      trigger="icon"
                    />
                    <DeleteCategoryButton
                      id={series.id}
                      collectionId={collection.id}
                      name={series.name}
                      kind="series"
                      hasContents={series._count.cards > 0}
                    />
                  </div>
                );
              })
            )}
          </div>
        </section>
        <section className="mt-7">
          <Header title="DANH MỤC" href="#" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <TypeCard
              icon={<Sparkles />}
              label="Thẻ đơn (Single Card)"
              count={typeCounts.SINGLE_CARD}
            />
            <TypeCard
              icon={<Package />}
              label="Sealed / Booster / Hộp"
              count={typeCounts.SEALED_PRODUCT}
            />
            <TypeCard
              icon={<Boxes />}
              label="Phụ kiện"
              count={typeCounts.ACCESSORY}
            />
            <TypeCard
              icon={<Grid2X2 />}
              label="Tất cả mục"
              count={allItems.length}
            />
          </div>
        </section>
        <section className="mt-7">
          <Header title="HOẠT ĐỘNG GẦN ĐÂY" href="#" />
          <div className="mt-3 space-y-2">
            {recent.length === 0 ? (
              <p className="rounded-xl border border-app-border bg-surface p-4 text-xs text-muted">
                Chưa có hoạt động trong bộ sưu tập này.
              </p>
            ) : (
              recent.map((item) => (
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-xl border border-app-border bg-surface p-3"
                  key={item.key}
                >
                  <div className="grid h-12 w-10 place-items-center overflow-hidden rounded-lg bg-violet-900">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Sparkles size={16} className="text-accent-text" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-primary">
                      {item.kind === "SALE"
                        ? `Bạn đã bán ${item.cardName}`
                        : `Bạn đã thêm ${item.cardName}`}
                      {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                    </p>
                    <p className="mt-1 text-[10px] text-muted">
                      {[
                        item.kind === "SALE" ? "Bán hàng" : null,
                        item.seriesName,
                        item.at.toLocaleDateString("vi-VN"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 border-r border-app-border px-2 last:border-0">
      <p className="truncate text-[9px] text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-primary">{value}</p>
    </div>
  );
}
function Quick({
  icon,
  label,
  active = false,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[9px] font-bold ${active ? "bg-violet-500/15 text-accent-text" : "text-muted"}`}
    >
      {icon}
      {label}
    </Link>
  );
}
function Header({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-black text-secondary">{title}</h2>
      <Link
        href={href}
        className="inline-flex items-center text-[10px] font-bold text-accent-text"
      >
        Xem tất cả <ChevronRight size={13} />
      </Link>
    </div>
  );
}
function TypeCard({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-app-border bg-surface p-3">
      <div className="flex items-center gap-2 text-accent-text">
        {icon}
        <p className="text-[10px] font-bold text-secondary">{label}</p>
      </div>
      <span className="text-xs font-black text-primary">{count}</span>
    </div>
  );
}
