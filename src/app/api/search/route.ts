import { NextResponse } from "next/server";
import { requireUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type UnifiedSearchResult = {
  id: string;
  type: "card" | "collection" | "series";
  name: string;
  image: string | null;
  meta: string;
  href: string;
};

const empty = { cards: [], collections: [], series: [] };

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const q = (params.get("q")?.trim() ?? "").slice(0, 120);
    const collectionId = params.get("collectionId")?.trim() || undefined;
    const seriesId = params.get("seriesId")?.trim() || undefined;
    if (q.length < 2) return NextResponse.json(empty);

    const scope =
      collectionId || seriesId
        ? await prisma.category.findMany({
            where: {
              userId: user.id,
              OR: [
                ...(collectionId ? [{ id: collectionId, parentId: null }] : []),
                ...(seriesId
                  ? [{ id: seriesId, parentId: collectionId ?? { not: null } }]
                  : []),
              ],
            },
            select: { id: true, parentId: true },
          })
        : [];
    if (collectionId && !scope.some((item) => item.id === collectionId))
      return NextResponse.json(
        { error: "Không có quyền truy cập bộ sưu tập." },
        { status: 403 },
      );
    if (seriesId && !scope.some((item) => item.id === seriesId))
      return NextResponse.json(
        { error: "Không có quyền truy cập series." },
        { status: 403 },
      );

    // Mỗi nhóm chỉ khớp theo tên của chính nhóm đó.
    // Card: tên hoặc mã card. Collection/Series: tên.
    // Không lan qua category/parent vì đã có section riêng.
    const nameMatch = {
      name: { contains: q, mode: "insensitive" as const },
    };
    const [cards, collections, series] = await Promise.all([
      prisma.card.findMany({
        where: {
          userId: user.id,
          ...(seriesId
            ? {
                categoryId: seriesId,
                category: { userId: user.id, parentId: collectionId },
              }
            : collectionId
              ? {
                  OR: [
                    { categoryId: collectionId },
                    { category: { userId: user.id, parentId: collectionId } },
                  ],
                }
              : {}),
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { cardNumber: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 6,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          referenceImage: true,
          cardNumber: true,
          setName: true,
          category: {
            select: {
              id: true,
              name: true,
              parentId: true,
              parent: { select: { id: true, name: true } },
            },
          },
          inventoryItems: {
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { imageUrl: true },
          },
        },
      }),
      prisma.category.findMany({
        where: {
          userId: user.id,
          parentId: null,
          ...(collectionId ? { id: collectionId } : {}),
          ...nameMatch,
        },
        take: 6,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          coverImageUrl: true,
          description: true,
          releaseYear: true,
        },
      }),
      prisma.category.findMany({
        where: {
          userId: user.id,
          parentId: { not: null },
          ...(seriesId
            ? { id: seriesId }
            : collectionId
              ? { parentId: collectionId }
              : {}),
          ...nameMatch,
          parent: { userId: user.id, parentId: null },
        },
        take: 6,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          coverImageUrl: true,
          description: true,
          releaseYear: true,
          parent: { select: { id: true, name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      cards: cards.map((card): UnifiedSearchResult => {
        const child = card.category?.parentId ? card.category : null;
        const root =
          card.category?.parent ??
          (card.category?.parentId ? null : card.category);
        return {
          id: card.id,
          type: "card",
          name: card.name,
          image: card.inventoryItems[0]?.imageUrl ?? card.referenceImage,
          meta:
            [card.cardNumber, card.setName, child?.name, root?.name]
              .filter(Boolean)
              .join(" · ") || "Card chưa phân loại",
          href: `/the/${card.id}`,
        };
      }),
      collections: collections.map((item): UnifiedSearchResult => ({
        id: item.id,
        type: "collection",
        name: item.name,
        image: item.coverImageUrl,
        meta:
          [item.releaseYear, item.description].filter(Boolean).join(" · ") ||
          "Bộ sưu tập",
        href: `/bo-suu-tap/${item.id}`,
      })),
      series: series.map((item): UnifiedSearchResult => ({
        id: item.id,
        type: "series",
        name: item.name,
        image: item.coverImageUrl,
        meta:
          [item.parent?.name, item.releaseYear, item.description]
            .filter(Boolean)
            .join(" · ") || "Series",
        href: `/bo-suu-tap/${item.parent!.id}/${item.id}`,
      })),
    });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? "Bạn cần đăng nhập." : "Không thể tìm kiếm." },
      { status },
    );
  }
}
