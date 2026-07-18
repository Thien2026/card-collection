import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  Hash,
  Layers3,
  MapPin,
  Package,
  Pencil,
  ReceiptText,
  StickyNote,
  Tag,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { CardImageGallery } from "@/components/card-image-gallery";
import { FavoriteButton } from "@/components/favorite-button";
import { Pagination } from "@/components/pagination";
import { RecentViewTracker } from "@/components/recent-view";
import { formatVnd } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { salesChannelLabel } from "@/lib/sales-channels";
import { DeleteCardButton } from "./delete-card-button";

const typeLabels = {
  SINGLE_CARD: "Thẻ đơn",
  SEALED_PRODUCT: "Sản phẩm sealed",
  ACCESSORY: "Phụ kiện",
} as const;

const conditionLabels: Record<string, string> = {
  MINT: "Mới hoàn toàn",
  NM: "Gần như mới",
  LP: "Ít dấu sử dụng",
  MP: "Hơi cũ",
  HP: "Nhiều dấu sử dụng",
  DMG: "Hư hại",
};

const conditionDescriptions: Record<string, string> = {
  MINT: "Mới nguyên, chưa có dấu hiệu sử dụng",
  NM: "Gần như mới, rất ít dấu hiệu sử dụng",
  LP: "Có vài dấu sử dụng nhẹ",
  MP: "Có dấu sử dụng rõ hơn",
  HP: "Nhiều dấu sử dụng, nhìn thấy rõ",
  DMG: "Bị hư hại hoặc lỗi nặng",
};

export default async function CardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ historyPage?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  const { cardId } = await params;
  const query = await searchParams;
  const requestedHistoryPage = positiveInt(query.historyPage);

  const card = await prisma.card.findFirst({
    where: { id: cardId, userId: session.user.id },
    include: {
      favorites: {
        where: { userId: session.user.id },
        select: { id: true },
      },
      category: {
        include: {
          parent: { select: { id: true, name: true } },
        },
      },
      images: { orderBy: { sortOrder: "asc" } },
      inventoryItems: {
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        include: {
          saleItems: {
            include: {
              sale: {
                include: {
                  items: { select: { soldPrice: true, refundedAt: true } },
                  expenses: { select: { amount: true, type: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!card) notFound();

  const availableItems = card.inventoryItems.filter(
    (item) => item.status === "AVAILABLE",
  );
  const reservedItems = card.inventoryItems.filter(
    (item) => item.status === "RESERVED",
  );
  const representative =
    availableItems[0] ?? reservedItems[0] ?? card.inventoryItems[0];
  const completedTransactions = card.inventoryItems
    .flatMap((item) =>
      item.saleItems.flatMap((saleItem) => {
        if (
          saleItem.sale.status !== "COMPLETED" &&
          saleItem.sale.status !== "REFUNDED"
        ) {
          return [];
        }
        const activeSaleItems = saleItem.sale.items.filter(
          (row) => !row.refundedAt,
        );
        const saleRevenue = activeSaleItems.reduce(
          (sum, row) => sum + row.soldPrice,
          0,
        );
        const saleExpenses = saleItem.sale.expenses
          .filter((row) => row.type !== "REFUND")
          .reduce((sum, row) => sum + row.amount, 0);
        const allocatedExpense =
          !saleItem.refundedAt && saleRevenue > 0
            ? Math.round((saleExpenses * saleItem.soldPrice) / saleRevenue)
            : 0;
        return [
          {
            id: saleItem.id,
            saleId: saleItem.sale.id,
            code: saleItem.sale.code,
            customerName: saleItem.sale.customerName,
            salesChannel: saleItem.sale.salesChannel,
            soldAt:
              saleItem.sale.completedAt ??
              saleItem.sale.updatedAt ??
              saleItem.createdAt,
            soldPrice: saleItem.soldPrice,
            costPrice: saleItem.costPrice,
            allocatedExpense,
            profit:
              saleItem.soldPrice - saleItem.costPrice - allocatedExpense,
            refundedAt: saleItem.refundedAt,
          },
        ];
      }),
    )
    .sort((a, b) => b.soldAt.getTime() - a.soldAt.getTime());
  const historyPageSize = 10;
  const historyTotalPages = Math.max(
    1,
    Math.ceil(completedTransactions.length / historyPageSize),
  );
  const historyPage = Math.min(requestedHistoryPage, historyTotalPages);
  const visibleTransactions = completedTransactions.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize,
  );
  const activeTransactions = completedTransactions.filter(
    (item) => !item.refundedAt,
  );

  const totalCapital = card.inventoryItems.reduce(
    (sum, item) => sum + item.costPrice,
    0,
  );
  const soldCapital = activeTransactions.reduce(
    (sum, item) => sum + item.costPrice,
    0,
  );
  const grossRevenue = activeTransactions.reduce(
    (sum, item) => sum + item.soldPrice,
    0,
  );
  const allocatedExpenses = activeTransactions.reduce(
    (sum, item) => sum + item.allocatedExpense,
    0,
  );
  const netProceeds = grossRevenue - allocatedExpenses;
  const realizedProfit = netProceeds - soldCapital;
  const remainingCapital = Math.max(totalCapital - netProceeds, 0);
  const cashAboveCapital = Math.max(netProceeds - totalCapital, 0);
  const isFullySold =
    card.inventoryItems.length > 0 &&
    availableItems.length === 0 &&
    reservedItems.length === 0;
  const hasRecoveredCapital = totalCapital > 0 && netProceeds >= totalCapital;

  const series = card.category?.parentId ? card.category : null;
  const collection =
    card.category?.parent ??
    (card.category?.parentId ? null : card.category);
  const backHref =
    collection && series
      ? `/bo-suu-tap/${collection.id}/${series.id}`
      : collection
        ? `/bo-suu-tap/${collection.id}`
        : "/the-them-gan-day";
  const rootId = collection?.id;
  const inheritedFavorite = rootId
    ? Boolean(
        await prisma.categoryFavorite.findFirst({
          where: { userId: session.user.id, categoryId: rootId },
          select: { id: true },
        }),
      )
    : false;
  const favoriteSource =
    card.favorites.length > 0
      ? ("explicit" as const)
      : inheritedFavorite
        ? ("inherited" as const)
        : ("none" as const);
  const galleryImages = card.images.length
    ? card.images.map((entry) => entry.url)
    : [representative?.imageUrl ?? card.referenceImage].filter(
        (entry): entry is string => Boolean(entry),
      );
  const image = galleryImages[0] ?? null;

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <RecentViewTracker
        userId={session.user.id}
        record={{
          type: "card",
          id: card.id,
          title: card.name,
          href: `/the/${card.id}`,
          image,
        }}
      />
      <main className="mx-auto min-h-screen max-w-5xl px-3 pb-28 pt-3 sm:px-6 lg:pb-12 lg:pt-7">
        <section className="overflow-hidden rounded-[28px] border border-app-border bg-surface p-3 shadow-2xl shadow-[var(--shadow)] sm:p-6">
          <header className="flex items-center justify-between">
            <BackButton href={backHref} label="Quay lại" />
            <div className="flex items-center gap-2">
              <HeaderAction
                label="Chỉnh sửa"
                href={`/the/${card.id}/chinh-sua`}
              >
                <Pencil size={17} />
              </HeaderAction>
              <DeleteCardButton
                cardId={card.id}
                name={card.name}
                saleCount={completedTransactions.length}
              />
            </div>
          </header>

          <div className="mt-5 grid grid-cols-[minmax(0,42%)_minmax(0,58%)] items-start gap-3 sm:mt-7 sm:grid-cols-[minmax(240px,42%)_1fr] sm:gap-7">
            <CardImageGallery images={galleryImages} name={card.name} />

            <div className="min-w-0">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <span className="inline-block rounded-md bg-violet-500/10 px-2 py-1 text-[8px] font-bold text-violet-300 sm:text-[10px]">
                    {representative
                      ? typeLabels[representative.itemType]
                      : "Thẻ / sản phẩm"}
                  </span>
                  <h1 className="mt-2 break-words text-lg font-black leading-tight text-primary sm:text-3xl">
                    {card.name}
                  </h1>
                  <p className="mt-2 break-words text-[9px] leading-4 text-muted sm:text-xs">
                    {[card.cardNumber, card.rarity, card.game]
                      .filter(Boolean)
                      .join(" · ") || "Chưa có thông tin phân loại"}
                  </p>
                </div>
                <FavoriteButton
                  id={card.id}
                  type="card"
                  source={favoriteSource}
                  label="Yêu thích thẻ này"
                  compact
                  className="mt-1 border-app-border bg-panel"
                />
              </div>

              <div className="mt-4 space-y-3 text-[9px] text-muted sm:mt-6 sm:text-xs">
                {card.game && (
                  <MetaLine
                    icon={<Layers3 size={15} />}
                    label=""
                    value={card.game}
                  />
                )}
                {(card.setName || series) && (
                  <MetaLine
                    icon={<WalletCards size={15} />}
                    label=""
                    value={card.setName ?? series!.name}
                  />
                )}
                {card.category?.releaseYear && (
                  <MetaLine
                    icon={<CalendarDays size={15} />}
                    label="Phát hành"
                    value={String(card.category.releaseYear)}
                  />
                )}
                {card.cardNumber && (
                  <MetaLine
                    icon={<Hash size={15} />}
                    label="Số thẻ"
                    value={card.cardNumber}
                  />
                )}
              </div>

              <div className="mt-4 rounded-xl border border-app-border bg-panel p-3 sm:mt-6 sm:rounded-2xl sm:p-4">
                <p className="text-[9px] text-muted sm:text-[10px]">
                  Giá lúc mua
                </p>
                <p className="mt-1 truncate text-base font-black text-primary sm:text-2xl">
                  {representative ? formatVnd(representative.costPrice) : "—"}
                </p>
                <p className="mt-1 text-[8px] text-muted sm:text-[10px]">
                  Giá vốn của mục
                </p>
              </div>

              {availableItems.length > 0 && (
                <Link
                  href={`/ban-hang/tao-moi?cardId=${card.id}`}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/20 sm:mt-4"
                >
                  <Tag size={17} />
                  Bán
                </Link>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:mt-7 sm:grid-cols-2">
            <div className="rounded-2xl border border-app-border bg-panel p-4">
              <p className="text-[10px] text-muted">Tình trạng</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-500/40 bg-violet-500/10 text-sm font-black text-violet-300">
                  {representative?.condition ?? "—"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-primary">
                    {representative
                      ? conditionLabels[representative.condition] ??
                        representative.condition
                      : "Chưa có dữ liệu"}
                  </p>
                  <p className="mt-1 text-[9px] text-muted">
                    {representative?.grading
                      ? `${representative.grading}${representative.gradeValue ? ` · ${representative.gradeValue}` : ""}`
                      : representative
                        ? (conditionDescriptions[representative.condition] ??
                          "Tình trạng hiện tại của mục")
                        : "Chưa có dữ liệu"}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-app-border rounded-2xl border border-app-border bg-panel p-4">
              <div className="pr-3">
                <p className="text-[10px] text-muted">
                  Số lượng sở hữu
                </p>
                <div className="mt-3 flex items-center gap-2 text-primary">
                  <Package size={17} className="text-violet-300" />
                  <strong className="text-base">{availableItems.length}</strong>
                  <span className="text-[10px] text-muted">
                    / {card.inventoryItems.length}
                  </span>
                </div>
              </div>
              <div className="min-w-0 pl-3">
                <p className="text-[10px] text-muted">
                  Vị trí lưu trữ
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <MapPin size={17} className="shrink-0 text-violet-300" />
                  <span className="truncate text-[10px] font-bold text-primary">
                    {representative?.storageLocation ?? "Chưa thiết lập"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <nav className="mt-6 flex gap-7 overflow-x-auto border-b border-app-border text-xs">
          <a
            href="#thong-tin"
            className="shrink-0 border-b-2 border-violet-500 pb-3 font-bold text-accent"
          >
            Thông tin
          </a>
          <a
            href="#lich-su-giao-dich"
            className="shrink-0 border-b-2 border-transparent pb-3 text-muted hover:text-secondary"
          >
            Lịch sử giao dịch
          </a>
          {card.notes || representative?.notes ? (
            <a
              href="#ghi-chu"
              className="shrink-0 border-b-2 border-transparent pb-3 text-muted hover:text-secondary"
            >
              Ghi chú
            </a>
          ) : null}
        </nav>

        <section
          id="thong-tin"
          className="mt-4 scroll-mt-4 rounded-3xl border border-app-border bg-surface p-5"
        >
          <h2 className="font-black text-primary">Thông tin thẻ</h2>
          <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Detail label="Tên" value={card.name} />
            <Detail label="Game" value={card.game} />
            <Detail label="Series / Bộ" value={card.setName ?? series?.name} />
            <Detail label="Mã thẻ" value={card.cardNumber} />
            <Detail label="Độ hiếm" value={card.rarity} />
            <Detail label="Nhân vật" value={card.characterName} />
            <Detail
              label="Tình trạng"
              value={
                representative
                  ? `${representative.condition} · ${conditionLabels[representative.condition] ?? representative.condition}`
                  : null
              }
            />
            <Detail
              label="Phân loại"
              value={
                representative ? typeLabels[representative.itemType] : null
              }
            />
            <Detail
              label="Ngày mua"
              value={
                representative?.acquiredAt
                  ? formatDate(representative.acquiredAt)
                  : null
              }
            />
            <Detail
              label="Vị trí lưu trữ"
              value={representative?.storageLocation}
            />
            <Detail label="SKU" value={representative?.sku} />
            {(representative?.grading || representative?.gradeValue) && (
              <Detail
                label="Chấm điểm"
                value={[representative.grading, representative.gradeValue]
                  .filter(Boolean)
                  .join(" · ")}
              />
            )}
          </div>
        </section>

        <section
          id="lich-su-giao-dich"
          className="mt-5 scroll-mt-4 rounded-3xl border border-app-border bg-surface p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-primary">Lịch sử giao dịch</h2>
              <p className="mt-1 text-[10px] leading-4 text-muted">
                Lãi từng thẻ đã trừ phần chi phí đơn hàng được phân bổ theo giá
                bán.
              </p>
            </div>
            <ReceiptText className="shrink-0 text-accent-text" size={20} />
          </div>

          {completedTransactions.length > 0 ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <TradeMetric
                  label="Doanh thu"
                  value={formatVnd(grossRevenue)}
                />
                <TradeMetric
                  label="Lãi/lỗ đã chốt"
                  value={formatSignedVnd(realizedProfit)}
                  tone={
                    realizedProfit > 0
                      ? "positive"
                      : realizedProfit < 0
                        ? "negative"
                        : "neutral"
                  }
                />
                <TradeMetric
                  label="Vốn toàn bộ"
                  value={formatVnd(totalCapital)}
                />
                <TradeMetric
                  label={
                    isFullySold
                      ? "Kết quả khi bán hết"
                      : hasRecoveredCapital
                        ? "Tiền vượt vốn"
                        : "Còn thiếu để huề vốn"
                  }
                  value={
                    isFullySold
                      ? formatSignedVnd(netProceeds - totalCapital)
                      : hasRecoveredCapital
                        ? formatVnd(cashAboveCapital)
                        : formatVnd(remainingCapital)
                  }
                  tone={
                    isFullySold
                      ? netProceeds - totalCapital > 0
                        ? "positive"
                        : netProceeds - totalCapital < 0
                          ? "negative"
                          : "neutral"
                      : hasRecoveredCapital
                        ? "positive"
                        : "negative"
                  }
                />
              </div>

              <div
                className={`mt-4 flex items-center gap-3 rounded-2xl border p-4 ${
                  isFullySold
                    ? netProceeds >= totalCapital
                      ? "border-emerald-500/25 bg-emerald-500/10"
                      : "border-rose-500/25 bg-rose-500/10"
                    : hasRecoveredCapital
                      ? "border-emerald-500/25 bg-emerald-500/10"
                      : "border-amber-500/25 bg-amber-500/10"
                }`}
              >
                {hasRecoveredCapital ? (
                  <TrendingUp size={20} className="text-emerald-500" />
                ) : (
                  <TrendingDown size={20} className="text-amber-500" />
                )}
                <div>
                  <p className="text-xs font-black text-primary">
                    {isFullySold
                      ? netProceeds > totalCapital
                        ? "Đã bán hết và có lời"
                        : netProceeds === totalCapital
                          ? "Đã bán hết và huề vốn"
                          : "Đã bán hết nhưng còn lỗ"
                      : hasRecoveredCapital
                        ? "Đã thu hồi đủ vốn"
                        : "Chưa thu hồi đủ vốn toàn bộ"}
                  </p>
                  <p className="mt-1 text-[10px] text-muted">
                    Tiền thu ròng {formatVnd(netProceeds)} trên tổng vốn{" "}
                    {formatVnd(totalCapital)}.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {visibleTransactions.map((transaction) => (
                  <article
                    key={transaction.id}
                    className="rounded-2xl border border-app-border bg-panel p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/ban-hang/${transaction.saleId}`}
                            className="relative z-[1] truncate text-xs font-black text-accent hover:underline"
                          >
                            {transaction.code}
                          </Link>
                          {transaction.refundedAt && (
                            <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[8px] font-black text-slate-600">
                              Đã hoàn
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] text-muted">
                          {formatDate(transaction.soldAt)}
                          {transaction.salesChannel
                            ? ` · ${salesChannelLabel(transaction.salesChannel)}`
                            : ""}
                          {transaction.customerName
                            ? ` · ${transaction.customerName}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-black ${
                          transaction.refundedAt
                            ? "text-muted"
                            : transaction.profit > 0
                              ? "text-emerald-500"
                              : transaction.profit < 0
                                ? "text-rose-500"
                                : "text-secondary"
                        }`}
                      >
                        {transaction.refundedAt
                          ? "Đã hoàn"
                          : formatSignedVnd(transaction.profit)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                      <SmallValue
                        label="Giá bán"
                        value={formatVnd(transaction.soldPrice)}
                      />
                      <SmallValue
                        label="Giá vốn"
                        value={formatVnd(transaction.costPrice)}
                      />
                      <SmallValue
                        label="Chi phí"
                        value={formatVnd(transaction.allocatedExpense)}
                      />
                    </div>
                  </article>
                ))}
              </div>
              <Pagination
                currentPage={historyPage}
                totalPages={historyTotalPages}
                basePath={`/the/${card.id}`}
                pageParam="historyPage"
              />
            </>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-app-border-strong px-5 py-10 text-center">
              <CircleDollarSign
                className="mx-auto text-accent-text"
                size={28}
              />
              <p className="mt-3 text-sm font-black text-primary">
                Chưa có giao dịch đã hoàn tất
              </p>
              <p className="mt-1 text-xs text-muted">
                Lịch sử bán và tình trạng hoàn vốn sẽ xuất hiện tại đây.
              </p>
            </div>
          )}
        </section>

        {(card.notes || representative?.notes) && (
          <section
            id="ghi-chu"
            className="mt-5 scroll-mt-4 rounded-3xl border border-app-border bg-surface p-5"
          >
            <div className="flex items-center gap-2">
              <StickyNote size={17} className="text-accent-text" />
              <h2 className="font-black text-primary">Ghi chú</h2>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-secondary">
              {representative?.notes ?? card.notes}
            </p>
          </section>
        )}

        {collection && (
          <div className="mt-5 text-center">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-surface px-4 py-3 text-xs font-bold text-accent shadow-sm transition hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-md"
            >
              <ArrowLeft size={15} />
              Quay lại {series?.name ?? collection.name}
            </Link>
          </div>
        )}
      </main>
    </AppShell>
  );
}

function positiveInt(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function HeaderAction({
  label,
  children,
  href,
}: {
  label: string;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-full border border-app-border bg-panel text-muted sm:h-11 sm:w-11"
    >
      {children}
    </Link>
  );
}

function MetaLine({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-violet-300">{icon}</span>
      <span>
        {label ? `${label}: ` : ""}
        <strong className="font-semibold text-primary">{value}</strong>
      </span>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-app-border pb-2 text-xs">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 break-words text-right font-semibold text-secondary">
        {value || "—"}
      </span>
    </div>
  );
}

function TradeMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-app-border bg-panel p-3">
      <p className="text-[9px] leading-4 text-muted">{label}</p>
      <p
        className={`mt-1 truncate text-xs font-black ${
          tone === "positive"
            ? "text-emerald-500"
            : tone === "negative"
              ? "text-rose-500"
              : "text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SmallValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="mt-1 truncate font-bold text-secondary">{value}</p>
    </div>
  );
}

function formatDate(value: Date) {
  return value.toLocaleDateString("vi-VN");
}

function formatSignedVnd(value: number) {
  if (value === 0) return formatVnd(0);
  return `${value > 0 ? "+" : "−"}${formatVnd(Math.abs(value))}`;
}
