import { prisma } from "@/lib/prisma";

export type FavoriteSource = "explicit" | "inherited" | "none";

export async function getFavoriteContext(userId: string) {
  const [explicitRows, rootRows] = await Promise.all([
    prisma.cardFavorite.findMany({
      where: { userId },
      select: { cardId: true },
    }),
    prisma.categoryFavorite.findMany({
      where: { userId, category: { userId, parentId: null } },
      select: { categoryId: true },
    }),
  ]);
  const explicitCardIds = new Set(explicitRows.map((row) => row.cardId));
  const favoriteRootIds = new Set(rootRows.map((row) => row.categoryId));
  return { explicitCardIds, favoriteRootIds };
}

export function favoriteSource(
  card: {
    categoryId?: string | null;
    category?: { parentId?: string | null } | null;
  },
  context: { explicitCardIds: Set<string>; favoriteRootIds: Set<string> },
  cardId: string,
): FavoriteSource {
  if (context.explicitCardIds.has(cardId)) return "explicit";
  const rootId = card.category?.parentId ?? card.categoryId;
  return rootId && context.favoriteRootIds.has(rootId) ? "inherited" : "none";
}
