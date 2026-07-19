"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { FavoriteSource } from "@/lib/favorites";

async function userId() {
  const s = await auth();
  if (!s?.user?.id) throw new Error("UNAUTHORIZED");
  return s.user.id;
}
function refreshFavorites() {
  revalidatePath("/yeu-thich");
  revalidatePath("/");
  revalidatePath("/bo-suu-tap");
  revalidatePath("/the-them-gan-day");
}

export async function toggleCategoryFavorite(
  id: string,
): Promise<{ source: FavoriteSource }> {
  const uid = await userId();
  const entity = await prisma.category.findFirst({
    where: { id, userId: uid, parentId: null },
    select: { id: true },
  });
  if (!entity) throw new Error("COLLECTION_NOT_FOUND");
  const old = await prisma.categoryFavorite.findUnique({
    where: { userId_categoryId: { userId: uid, categoryId: id } },
  });
  if (old) await prisma.categoryFavorite.delete({ where: { id: old.id } });
  else
    await prisma.categoryFavorite.create({
      data: { userId: uid, categoryId: id },
    });
  refreshFavorites();
  return { source: old ? "none" : "explicit" };
}

export async function toggleCardFavorite(
  id: string,
): Promise<{ source: FavoriteSource }> {
  const uid = await userId();
  const entity = await prisma.card.findFirst({
    where: { id, userId: uid },
    select: {
      id: true,
      categoryId: true,
      category: { select: { parentId: true } },
    },
  });
  if (!entity) throw new Error("CARD_NOT_FOUND");
  const old = await prisma.cardFavorite.findUnique({
    where: { userId_cardId: { userId: uid, cardId: id } },
  });
  if (old) await prisma.cardFavorite.delete({ where: { id: old.id } });
  else await prisma.cardFavorite.create({ data: { userId: uid, cardId: id } });
  let source: FavoriteSource = old ? "none" : "explicit";
  if (old) {
    const rootId = entity.category?.parentId ?? entity.categoryId;
    if (rootId) {
      const inherited = await prisma.categoryFavorite.findFirst({
        where: {
          userId: uid,
          categoryId: rootId,
          category: { userId: uid, parentId: null },
        },
        select: { id: true },
      });
      if (inherited) source = "inherited";
    }
  }
  refreshFavorites();
  return { source };
}
