"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { moveTemporaryImage, removeDirectory, removeStoredImage } from "@/lib/image-storage";

export async function createCollection(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Tên bộ sưu tập là bắt buộc.");

  const collection = await prisma.category.create({
    data: {
      name,
      userId: session.user.id,
      accentColor:
        String(formData.get("accentColor") ?? "").trim() || "#8b5cf6",
      description: String(formData.get("description") ?? "").trim() || null,
      releaseYear: Number(formData.get("releaseYear")) || null,
      targetItemCount: Number(formData.get("targetItemCount")) || null,
    },
  });
  const coverImageUrl = await moveTemporaryImage({
    userId: session.user.id,
    token: String(formData.get("coverImageToken") ?? "").trim() || null,
    destination: `users/${session.user.id}/collections/${collection.id}/cover.webp`,
  });
  const bannerImageUrl = await moveTemporaryImage({
    userId: session.user.id,
    token: String(formData.get("bannerImageToken") ?? "").trim() || null,
    destination: `users/${session.user.id}/collections/${collection.id}/banner.webp`,
  });
  if (coverImageUrl || bannerImageUrl) {
    await prisma.category.update({
      where: { id: collection.id },
      data: { coverImageUrl, bannerImageUrl },
    });
  }
  revalidatePath("/bo-suu-tap");
  revalidatePath("/");
  revalidatePath("/them-card");
  return { id: collection.id };
}

export async function createSeries(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const name = String(formData.get("name") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "").trim();
  if (!name || !parentId)
    throw new Error("Tên series và bộ sưu tập là bắt buộc.");

  const parent = await prisma.category.findFirst({
    where: { id: parentId, userId: session.user.id, parentId: null },
    select: { id: true },
  });
  if (!parent) throw new Error("Không tìm thấy bộ sưu tập.");

  const series = await prisma.category.create({
    data: {
      name,
      parentId,
      userId: session.user.id,
      accentColor:
        String(formData.get("accentColor") ?? "").trim() || "#8b5cf6",
      description: String(formData.get("description") ?? "").trim() || null,
      releaseYear: Number(formData.get("releaseYear")) || null,
      targetItemCount: Number(formData.get("targetItemCount")) || null,
    },
  });
  const coverImageUrl = await moveTemporaryImage({
    userId: session.user.id,
    token: String(formData.get("coverImageToken") ?? "").trim() || null,
    destination: `users/${session.user.id}/collections/${parentId}/series/${series.id}/cover.webp`,
  });
  if (coverImageUrl)
    await prisma.category.update({
      where: { id: series.id },
      data: { coverImageUrl },
    });
  revalidatePath("/bo-suu-tap");
  revalidatePath(`/bo-suu-tap/${parentId}`);
  revalidatePath("/them-card");
  return { id: series.id };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function purgeCardsInTransaction(
  tx: Tx,
  userId: string,
  cardIds: string[],
) {
  if (!cardIds.length) return;

  const inventoryItems = await tx.inventoryItem.findMany({
    where: { cardId: { in: cardIds }, userId },
    select: { id: true },
  });
  const inventoryIds = inventoryItems.map((item) => item.id);

  const saleItems = inventoryIds.length
    ? await tx.saleItem.findMany({
        where: { inventoryItemId: { in: inventoryIds } },
        select: { id: true, saleId: true },
      })
    : [];
  const saleIds = [...new Set(saleItems.map((item) => item.saleId))];

  if (saleItems.length) {
    await tx.saleItem.deleteMany({
      where: { id: { in: saleItems.map((item) => item.id) } },
    });
  }

  if (saleIds.length) {
    const remaining = await tx.saleItem.groupBy({
      by: ["saleId"],
      where: { saleId: { in: saleIds } },
      _count: { _all: true },
    });
    const stillHasItems = new Set(remaining.map((row) => row.saleId));
    const emptySaleIds = saleIds.filter((id) => !stillHasItems.has(id));
    if (emptySaleIds.length) {
      await tx.saleExpense.deleteMany({
        where: { saleId: { in: emptySaleIds } },
      });
      await tx.sale.deleteMany({ where: { id: { in: emptySaleIds } } });
    }
  }

  if (inventoryIds.length) {
    await tx.inventoryAuditItem.deleteMany({
      where: { inventoryItemId: { in: inventoryIds } },
    });
    await tx.inventoryItem.deleteMany({
      where: { id: { in: inventoryIds } },
    });
  }

  await tx.cardImage.deleteMany({ where: { cardId: { in: cardIds } } });
  await tx.cardFavorite.deleteMany({ where: { cardId: { in: cardIds } } });
  await tx.card.deleteMany({ where: { id: { in: cardIds }, userId } });
}

export async function deleteCollection(collectionId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  const userId = session.user.id;

  const collection = await prisma.category.findFirst({
    where: { id: collectionId, userId, parentId: null },
    include: {
      children: { select: { id: true } },
      cards: { select: { id: true, referenceImage: true, images: { select: { url: true } } } },
    },
  });
  if (!collection) throw new Error("Không tìm thấy bộ sưu tập.");

  const seriesIds = collection.children.map((child) => child.id);
  const seriesCards =
    seriesIds.length > 0
      ? await prisma.card.findMany({
          where: { categoryId: { in: seriesIds }, userId },
          select: {
            id: true,
            referenceImage: true,
            images: { select: { url: true } },
          },
        })
      : [];

  const allCards = [...collection.cards, ...seriesCards];
  const cardIds = allCards.map((card) => card.id);
  const categoryIds = [collection.id, ...seriesIds];

  await prisma.$transaction(async (tx) => {
    await purgeCardsInTransaction(tx, userId, cardIds);
    await tx.categoryFavorite.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await tx.inventoryAudit.deleteMany({
      where: { collectionId: collection.id },
    });
    if (seriesIds.length) {
      await tx.category.deleteMany({ where: { id: { in: seriesIds } } });
    }
    await tx.category.delete({ where: { id: collection.id } });
  });

  await removeDirectory(`users/${userId}/collections/${collection.id}`).catch(
    () => undefined,
  );
  await Promise.all(
    cardIds.map((cardId) =>
      removeDirectory(`users/${userId}/cards/${cardId}`).catch(() => undefined),
    ),
  );
  const imageUrls = allCards.flatMap((card) => [
    ...card.images.map((image) => image.url),
    card.referenceImage,
  ]).filter((url): url is string => Boolean(url));
  await Promise.all(
    imageUrls.map((url) =>
      removeStoredImage({ userId, url }).catch(() => undefined),
    ),
  );

  revalidatePath("/");
  revalidatePath("/bo-suu-tap");
  revalidatePath("/the-them-gan-day");
  revalidatePath("/yeu-thich");
  revalidatePath("/xem-gan-day");
  revalidatePath("/them-card");
}

export async function deleteSeries(seriesId: string, collectionId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  const userId = session.user.id;

  const series = await prisma.category.findFirst({
    where: { id: seriesId, parentId: collectionId, userId },
    include: {
      cards: {
        select: {
          id: true,
          referenceImage: true,
          images: { select: { url: true } },
        },
      },
    },
  });
  if (!series) throw new Error("Không tìm thấy series.");

  const cardIds = series.cards.map((card) => card.id);

  await prisma.$transaction(async (tx) => {
    await purgeCardsInTransaction(tx, userId, cardIds);
    await tx.categoryFavorite.deleteMany({ where: { categoryId: series.id } });
    await tx.category.delete({ where: { id: series.id } });
  });

  await removeDirectory(
    `users/${userId}/collections/${collectionId}/series/${series.id}`,
  ).catch(() => undefined);
  await Promise.all(
    cardIds.map((cardId) =>
      removeDirectory(`users/${userId}/cards/${cardId}`).catch(() => undefined),
    ),
  );
  const imageUrls = series.cards
    .flatMap((card) => [
      ...card.images.map((image) => image.url),
      card.referenceImage,
    ])
    .filter((url): url is string => Boolean(url));
  await Promise.all(
    imageUrls.map((url) =>
      removeStoredImage({ userId, url }).catch(() => undefined),
    ),
  );

  revalidatePath("/");
  revalidatePath("/bo-suu-tap");
  revalidatePath(`/bo-suu-tap/${collectionId}`);
  revalidatePath("/the-them-gan-day");
  revalidatePath("/yeu-thich");
  revalidatePath("/xem-gan-day");
  revalidatePath("/them-card");
}

export async function updateCategory(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  const id = String(formData.get("id") ?? "").trim();
  const current = await prisma.category.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!current) throw new Error("Không tìm thấy danh mục.");
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  if (current.parentId && parentId !== current.parentId)
    throw new Error("Không thể đổi bộ sưu tập cha của series.");
  if (!current.parentId && parentId)
    throw new Error("Bộ sưu tập không thể trở thành series.");
  if (parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: parentId, userId: session.user.id, parentId: null },
      select: { id: true },
    });
    if (!parent) throw new Error("Bộ sưu tập cha không hợp lệ.");
  }
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Tên là bắt buộc.");
  const coverToken = String(formData.get("coverImageToken") ?? "").trim();
  const bannerToken = String(formData.get("bannerImageToken") ?? "").trim();
  const base = parentId
    ? `users/${session.user.id}/collections/${parentId}/series/${id}`
    : `users/${session.user.id}/collections/${id}`;
  const coverImageUrl = coverToken
    ? await moveTemporaryImage({
        userId: session.user.id,
        token: coverToken,
        destination: `${base}/cover.webp`,
      })
    : current.coverImageUrl;
  const bannerImageUrl =
    !parentId && bannerToken
      ? await moveTemporaryImage({
          userId: session.user.id,
          token: bannerToken,
          destination: `${base}/banner.webp`,
        })
      : current.bannerImageUrl;
  await prisma.category.update({
    where: { id },
    data: {
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      releaseYear: Number(formData.get("releaseYear")) || null,
      targetItemCount: Number(formData.get("targetItemCount")) || null,
      accentColor:
        String(formData.get("accentColor") ?? "").trim() || "#8b5cf6",
      coverImageUrl,
      bannerImageUrl,
    },
  });
  revalidatePath("/");
  revalidatePath("/bo-suu-tap");
  revalidatePath(`/bo-suu-tap/${parentId ?? id}`);
  if (parentId) revalidatePath(`/bo-suu-tap/${parentId}/${id}`);
}
