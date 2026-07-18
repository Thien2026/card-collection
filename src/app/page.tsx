import { formatVnd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import Image from "next/image";
import { AppShell } from "@/components/app-shell";
import { FavoriteButton } from "@/components/favorite-button";
import { GlobalCardSearch } from "@/components/global-card-search";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LOGO_SRC } from "@/lib/brand";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Boxes,
  BarChart3,
  ScanLine,
  Sparkles,
  Heart,
  History,
} from "lucide-react";

export default async function Home() {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  const [
    availableCount,
    inventoryValue,
    completedSales,
    recentCardGroups,
    series,
    favoriteCount,
    profile,
  ] = await Promise.all([
    prisma.inventoryItem.count({
      where: { userId: session.user.id, status: "AVAILABLE" },
    }),
    prisma.inventoryItem.aggregate({
      where: { userId: session.user.id, status: "AVAILABLE" },
      _sum: { costPrice: true },
    }),
    prisma.sale.findMany({
      where: { createdById: session.user.id, status: "COMPLETED" },
      include: { items: true, expenses: true },
    }),
    prisma.inventoryItem.groupBy({
      by: ["cardId"],
      where: { userId: session.user.id },
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: 5,
    }),
    prisma.category.findMany({
      where: {
        userId: session.user.id,
        parentId: { not: null },
        parent: { userId: session.user.id, parentId: null },
      },
      select: {
        id: true,
        name: true,
        coverImageUrl: true,
        bannerImageUrl: true,
        accentColor: true,
        targetItemCount: true,
        parent: { select: { id: true, name: true } },
        cards: {
          select: {
            inventoryItems: {
              where: { userId: session.user.id, status: "AVAILABLE" },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.card.count({
      where: {
        userId: session.user.id,
        OR: [
          { favorites: { some: { userId: session.user.id } } },
          {
            category: {
              favorites: { some: { userId: session.user.id } },
              parentId: null,
            },
          },
          {
            category: {
              parent: {
                favorites: { some: { userId: session.user.id } },
                parentId: null,
              },
            },
          },
        ],
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    }),
  ]);

  const recentCardDetails = await prisma.card.findMany({
    where: {
      userId: session.user.id,
      id: { in: recentCardGroups.map((group) => group.cardId) },
    },
    include: {
      inventoryItems: {
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      category: {
        select: {
          id: true,
          parentId: true,
          favorites: {
            where: { userId: session.user.id },
            select: { id: true },
          },
          parent: {
            select: {
              favorites: {
                where: { userId: session.user.id },
                select: { id: true },
              },
            },
          },
        },
      },
      favorites: {
        where: { userId: session.user.id },
        select: { id: true },
      },
    },
  });
  const recentById = new Map(
    recentCardDetails.map((card) => [card.id, card]),
  );
  const recentCards = recentCardGroups.flatMap((group) => {
    const card = recentById.get(group.cardId);
    const item = card?.inventoryItems[0];
    if (!card || !item) return [];
    return [{ ...item, card, quantity: group._count.id }];
  });

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <header className="border-b border-app-border bg-app-bg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-violet-400">
              <Image
                src={LOGO_SRC}
                alt="Card Collection"
                fill
                sizes="48px"
                className="object-contain"
                priority
                unoptimized
              />
            </div>
            <div>
              <p className="text-xs text-muted">Xin chào,</p>
              <h1 className="text-lg font-black text-primary">
                {profile?.name || session.user.name || "Collector"}
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GlobalCardSearch />
            <ThemeSwitcher compact />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-5 lg:px-10 lg:py-10">
        <section className="relative mb-5 overflow-hidden rounded-[22px] border border-media-border bg-[radial-gradient(circle_at_85%_25%,rgba(130,92,255,0.34),transparent_34%),radial-gradient(circle_at_15%_100%,rgba(57,93,214,0.26),transparent_46%),linear-gradient(135deg,#292467_0%,#19184f_52%,#0d112c_100%)] p-5 text-on-media shadow-[0_0_20px_rgba(104,79,244,0.14),0_20px_46px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.18)]">
          <img
            src="/images/collection-cover.png"
            alt="Bộ sưu tập Conan"
            className="absolute -right-3 bottom-14 z-0 h-[98%] w-[42%] object-contain object-bottom opacity-70 blur-[0.25px] [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.25)_26%,black_58%)] drop-shadow-[0_0_14px_rgba(145,117,255,0.3)]"
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(221,214,255,0.13),transparent_35%),linear-gradient(115deg,rgba(255,255,255,0.1),rgba(255,255,255,0.045)_46%,rgba(138,112,255,0.09)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-16px_28px_rgba(46,32,130,0.13)]" />
          <p className="relative z-20 text-[11px] font-bold tracking-wider text-violet-300">
            TỔNG QUAN BỘ SƯU TẬP
          </p>
          <div className="relative z-20 mt-3 flex gap-8">
            <div>
              <p className="text-4xl font-black">{availableCount}</p>
              <p className="mt-1 text-xs text-on-media-muted">Thẻ đã sở hữu</p>
            </div>
            <div className="border-l border-media-border pl-5">
              <p className="text-xs text-on-media-muted">ƯỚC TÍNH GIÁ TRỊ</p>
              <p className="mt-1 text-lg font-black text-violet-300">
                {formatVnd(inventoryValue._sum.costPrice ?? 0)}
              </p>
              <p className="text-[10px] font-bold text-emerald-400">
                ↑ Theo giá vốn hiện tại
              </p>
            </div>
          </div>
          <div className="relative z-20 mt-5 grid grid-cols-4 border-t border-media-border pt-4 text-center text-xs">
            <Summary label="Bộ sưu tập" value={availableCount} />
            <Summary label="Hoàn thành" value="0%" />
            <Summary label="Giao dịch" value={completedSales.length} />
            <Summary label="Yêu thích" value={favoriteCount} />
          </div>
        </section>
        <section className="mb-7 grid grid-cols-6 gap-2 sm:gap-3">
          {[
            { label: "Bộ sưu tập", icon: Boxes, href: "/bo-suu-tap" },
            { label: "Thêm card", icon: BookOpen, href: "/them-card" },
            { label: "Yêu thích", icon: Heart, href: "/yeu-thich" },
            {
              label: "Báo cáo",
              icon: BarChart3,
              href: "/ban-hang/bao-cao",
            },
            { label: "Quét thẻ", icon: ScanLine, disabled: true },
            { label: "Gần đây", icon: History, href: "/xem-gan-day" },
          ].map(({ icon: Icon, label, href, disabled }) => {
            const content = (
              <>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent-text">
                  <Icon size={21} strokeWidth={2.2} />
                </span>
                <span className="truncate">{label}</span>
              </>
            );
            const className = `flex min-w-0 flex-col items-center gap-2 text-center text-[10px] font-bold ${disabled ? "cursor-not-allowed text-muted opacity-55" : "text-secondary"}`;
            return disabled ? (
              <span
                key={label}
                title="Sắp ra mắt"
                aria-label={`${label} — Sắp ra mắt`}
                aria-disabled="true"
                className={className}
              >
                {content}
              </span>
            ) : (
              <Link href={href!} key={label} className={className}>
                {content}
              </Link>
            );
          })}
        </section>
        <section className="mb-8">
          <SectionTitle title="THẺ THÊM GẦN ĐÂY" href="/the-them-gan-day" />
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
            {recentCards.length === 0 ? (
              <EmptyCard />
            ) : (
              recentCards.map((item) => (
                <CardPreview
                  key={item.id}
                  cardId={item.card.id}
                  name={item.card.name}
                  rarity={item.card.rarity ?? "CARD"}
                  imageUrl={item.imageUrl}
                  quantity={item.quantity}
                  favoriteSource={
                    item.card.favorites.length > 0
                      ? "explicit"
                      : item.card.category?.favorites.length ||
                          item.card.category?.parent?.favorites.length
                        ? "inherited"
                        : "none"
                  }
                />
              ))
            )}
            <Link
              href="/the-them-gan-day"
              className="grid w-28 shrink-0 aspect-[2.5/3.5] place-items-center rounded-xl border border-dashed border-violet-300/40 bg-violet-500/5 text-3xl text-accent-text sm:w-32"
            >
              +
            </Link>
          </div>
        </section>
        <section className="mb-8">
          <SectionTitle title="BỘ SƯU TẬP THEO SERIES" href="/bo-suu-tap" />
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
            {series.length === 0 ? (
              <div className="grid min-h-44 min-w-full place-items-center rounded-xl border border-dashed border-app-border-strong px-6 text-center text-xs text-muted">
                Chưa có series. Hãy tạo series trong Bộ sưu tập để bắt đầu.
              </div>
            ) : (
              series.map((entry) => {
                const count = entry.cards.reduce(
                  (total, card) => total + card.inventoryItems.length,
                  0,
                );
                const progress = entry.targetItemCount
                  ? Math.min(
                      100,
                      Math.round((count / entry.targetItemCount) * 100),
                    )
                  : null;
                const imageUrl = entry.bannerImageUrl ?? entry.coverImageUrl;
                return (
                  <Link
                    href={`/bo-suu-tap/${entry.parent!.id}/${entry.id}`}
                    key={entry.id}
                    className="relative min-w-32 aspect-[2.5/3.5] overflow-hidden rounded-xl border border-media-border p-3 shadow-lg shadow-black/20"
                    style={{ backgroundColor: entry.accentColor ?? "#4c1d95" }}
                  >
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(255,255,255,0.27),transparent_28%),linear-gradient(to_top,rgba(4,7,22,0.96),transparent_64%)]" />
                    <BookOpen size={25} className="relative text-on-media/85" />
                    <div className="absolute inset-x-3 bottom-3">
                      <p className="truncate text-xs font-black text-on-media">
                        {entry.name}
                      </p>
                      <p className="mt-1 text-[10px] text-on-media-muted">
                        {count} thẻ
                      </p>
                      {progress !== null && (
                        <div
                          className="mt-2 h-1 overflow-hidden rounded-full bg-white/20"
                          aria-label={`Hoàn thành ${progress}%`}
                        >
                          <div
                            className="h-full rounded-full bg-violet-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
            <Link
              href="/bo-suu-tap"
              aria-label="Xem thêm series"
              className="grid min-w-24 aspect-[2.5/3.5] place-items-center rounded-xl border border-dashed border-violet-300/40 bg-violet-500/5 text-accent-text"
            >
              <BookOpen size={26} />
            </Link>
          </div>
        </section>
        <section className="rounded-2xl border border-app-border bg-surface p-4">
          <SectionTitle title="XEM GẦN ĐÂY" href="/xem-gan-day" />
          <div className="mt-4 flex items-center gap-3">
            {recentCards[0] ? (
              <CardPreview
                cardId={recentCards[0].card.id}
                name={recentCards[0].card.name}
                rarity={recentCards[0].card.rarity ?? "CARD"}
                imageUrl={recentCards[0].imageUrl}
                favoriteSource={
                  recentCards[0].card.favorites.length > 0
                    ? "explicit"
                    : recentCards[0].card.category?.favorites.length ||
                        recentCards[0].card.category?.parent?.favorites.length
                      ? "inherited"
                      : "none"
                }
                compact
                showFavorite={false}
              />
            ) : (
              <span className="grid h-14 w-10 place-items-center rounded bg-violet-500/20 text-accent-text">
                ✦
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black">
                {recentCards[0]?.card.name ?? "Chưa có card"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {recentCards[0]?.card.game ?? "Thêm card để bắt đầu bộ sưu tập"}
              </p>
            </div>
            <p className="text-xs font-bold text-emerald-400">
              {recentCards[0] ? formatVnd(recentCards[0].costPrice) : ""}
            </p>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-black text-on-media">{value}</p>
      <p className="mt-1 text-[9px] text-on-media-muted">{label}</p>
    </div>
  );
}
function SectionTitle({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-black tracking-wide text-secondary">
        {title}
      </h2>
      <Link href={href} className="text-[10px] font-bold text-accent">
        Xem tất cả ›
      </Link>
    </div>
  );
}
function EmptyCard() {
  return (
    <div className="grid w-28 shrink-0 aspect-[2.5/3.5] place-items-center rounded-xl border border-dashed border-app-border-strong text-muted sm:w-32">
      <Sparkles size={24} />
    </div>
  );
}
function CardPreview({
  cardId,
  name,
  rarity,
  imageUrl,
  quantity,
  favoriteSource,
  compact = false,
  showFavorite = true,
}: {
  cardId: string;
  name: string;
  rarity: string;
  imageUrl: string | null;
  quantity?: number;
  favoriteSource: "explicit" | "inherited" | "none";
  compact?: boolean;
  showFavorite?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "overflow-hidden rounded-lg bg-gradient-to-br from-indigo-950 to-slate-800"
          : "w-28 shrink-0 sm:w-32"
      }
    >
      <div
        className={`${compact ? "h-14 w-10" : "aspect-[2.5/3.5]"} relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-900 via-slate-800 to-violet-950`}
      >
        <Link
          href={`/the/${cardId}`}
          aria-label={`Xem chi tiết ${name}`}
          className="absolute inset-0 z-[1] rounded-xl"
        />
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="grid h-full place-items-center text-amber-300">
            <Sparkles size={24} />
          </span>
        )}
        <span className="absolute left-1 top-1 rounded bg-violet-600 px-1 text-[8px] font-black text-white">
          {rarity}
        </span>
        {!compact && quantity && quantity > 1 && (
          <span className="absolute right-1 top-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[8px] font-black text-white">
            ×{quantity}
          </span>
        )}
        {showFavorite && (
          <FavoriteButton
            id={cardId}
            type="card"
            source={favoriteSource}
            compact
            className="absolute bottom-1 right-1 z-10"
          />
        )}
      </div>
      {!compact && (
        <p className="mt-2 truncate text-[10px] font-bold text-secondary">
          {name}
        </p>
      )}
    </div>
  );
}
