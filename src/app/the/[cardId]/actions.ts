"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  copyStoredImage,
  moveTemporaryImage,
  removeDirectory,
  removeStoredImage,
  type ImageCrop,
} from "@/lib/image-storage";
import { IMAGE_UPLOAD_MAX_FILES } from "@/lib/upload-image";

const conditions = new Set(["MINT", "NM", "LP", "MP", "HP", "DMG"]);
type EditImage =
  | { existingId: string; token: null; crop: null }
  | { existingId: null; token: string; crop: ImageCrop | null };

function parseImages(value: FormDataEntryValue | null): EditImage[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > IMAGE_UPLOAD_MAX_FILES)
      throw new Error("INVALID_IMAGES");
    return parsed.map((entry) => {
      if (!entry || typeof entry !== "object")
        throw new Error("INVALID_IMAGES");
      if (
        "id" in entry &&
        typeof entry.id === "string" &&
        entry.id.length > 0
      )
        return { existingId: entry.id, token: null, crop: null };
      if (
        !("token" in entry) ||
        typeof entry.token !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(entry.token)
      )
        throw new Error("INVALID_IMAGES");
      return {
        existingId: null,
        token: entry.token,
        crop:
          "crop" in entry && entry.crop && typeof entry.crop === "object"
            ? (entry.crop as ImageCrop)
            : null,
      };
    });
  } catch {
    throw new Error("Danh sách ảnh không hợp lệ.");
  }
}

export async function updateCard(cardId: string, formData: FormData) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");

  const card = await prisma.card.findFirst({
    where: { id: cardId, userId: session.user.id },
    select: {
      id: true,
      referenceImage: true,
      images: { select: { id: true, url: true }, orderBy: { sortOrder: "asc" } },
      inventoryItems: {
        where: { userId: session.user.id, imageUrl: { not: null } },
        take: 5,
        select: { imageUrl: true },
      },
    },
  });
  if (!card) throw new Error("Không tìm thấy card hoặc bạn không có quyền sửa.");

  const name = String(formData.get("name") ?? "").trim();
  const condition = String(formData.get("condition") ?? "NM");
  const costPrice = Number(formData.get("costPrice") ?? 0);
  const marketPriceRaw = String(formData.get("marketPrice") ?? "").trim();
  const marketPrice = marketPriceRaw === "" ? null : Number(marketPriceRaw);
  const imagesField = formData.get("images");
  const requestedImages = parseImages(imagesField);
  const acquiredAtValue = String(formData.get("acquiredAt") ?? "").trim();
  const acquiredAt = acquiredAtValue
    ? new Date(`${acquiredAtValue}T00:00:00.000Z`)
    : null;

  if (
    !name ||
    !conditions.has(condition) ||
    !Number.isInteger(costPrice) ||
    costPrice < 0 ||
    (marketPrice !== null &&
      (!Number.isInteger(marketPrice) || marketPrice < 0)) ||
    (acquiredAt && Number.isNaN(acquiredAt.getTime()))
  ) {
    throw new Error("Thông tin chỉnh sửa không hợp lệ.");
  }

  const notes = String(formData.get("notes") ?? "").trim() || null;
  const existingById = new Map(card.images.map((image) => [image.id, image]));
  const legacyUrl =
    card.images.length === 0
      ? (card.referenceImage ??
        card.inventoryItems.find((item) => item.imageUrl)?.imageUrl ??
        null)
      : null;
  if (legacyUrl) existingById.set("legacy", { id: "legacy", url: legacyUrl });

  // keepImageIds là nguồn dự phòng nếu JSON images bị thiếu ảnh cũ.
  const keepIds = formData
    .getAll("keepImageIds")
    .map(String)
    .filter((id) => existingById.has(id));
  const requestedIds = new Set(
    requestedImages
      .map((image) => image.existingId)
      .filter((id): id is string => Boolean(id)),
  );
  const recovered = keepIds
    .filter((id) => !requestedIds.has(id))
    .map(
      (id): EditImage => ({
        existingId: id,
        token: null,
        crop: null,
      }),
    );
  const orderedImages = [...recovered, ...requestedImages].slice(
    0,
    IMAGE_UPLOAD_MAX_FILES,
  );

  const previousUrls = new Set(
    [...existingById.values()].map((image) => image.url),
  );
  const retainedIds = new Set<string>();
  const finalUrls: string[] = [];
  const createdUrls: string[] = [];
  const cardDir = `users/${session.user.id}/cards/${card.id}`;

  try {
    for (const image of orderedImages) {
      if (image.existingId) {
        const existing = existingById.get(image.existingId);
        if (!existing || retainedIds.has(existing.id)) continue;
        retainedIds.add(existing.id);

        // Ảnh legacy (lưu ở /items) được copy vào thư mục card để không mất khi cập nhật.
        if (image.existingId === "legacy") {
          const copied = await copyStoredImage({
            userId: session.user.id,
            url: existing.url,
            destination: `${cardDir}/${randomUUID()}.webp`,
          });
          finalUrls.push(copied);
          if (copied !== existing.url) createdUrls.push(copied);
        } else {
          finalUrls.push(existing.url);
        }
        continue;
      }

      const url = await moveTemporaryImage({
        userId: session.user.id,
        token: image.token,
        crop: image.crop,
        destination: `${cardDir}/${randomUUID()}.webp`,
      });
      if (url) {
        finalUrls.push(url);
        createdUrls.push(url);
      }
    }

    // Nếu form không gửi field ảnh (lỗi client), giữ nguyên gallery hiện có.
    if (typeof imagesField !== "string" && !finalUrls.length) {
      finalUrls.push(...card.images.map((image) => image.url));
      if (!finalUrls.length && legacyUrl) finalUrls.push(legacyUrl);
    }

    const uniqueUrls = [...new Set(finalUrls)].slice(0, IMAGE_UPLOAD_MAX_FILES);
    const primaryImage = uniqueUrls[0] ?? null;

    await prisma.$transaction([
      prisma.cardImage.deleteMany({ where: { cardId: card.id } }),
      ...(uniqueUrls.length
        ? [
            prisma.cardImage.createMany({
              data: uniqueUrls.map((url, sortOrder) => ({
                cardId: card.id,
                url,
                sortOrder,
              })),
            }),
          ]
        : []),
      prisma.card.update({
        where: { id: card.id },
        data: {
          name,
          setName: String(formData.get("setName") ?? "").trim() || null,
          cardNumber: String(formData.get("cardNumber") ?? "").trim() || null,
          characterName:
            String(formData.get("characterName") ?? "").trim() || null,
          rarity: String(formData.get("rarity") ?? "").trim() || null,
          marketPrice,
          referenceImage: primaryImage,
          notes,
        },
      }),
      prisma.inventoryItem.updateMany({
        where: {
          cardId: card.id,
          userId: session.user.id,
          status: { in: ["AVAILABLE", "RESERVED"] },
        },
        data: {
          condition,
          costPrice,
          acquiredAt,
          imageUrl: primaryImage,
          storageLocation:
            String(formData.get("storageLocation") ?? "").trim() || null,
          notes,
        },
      }),
    ]);

    const kept = new Set(uniqueUrls);
    await Promise.all(
      [...previousUrls]
        .filter((url) => !kept.has(url))
        .map((url) =>
          removeStoredImage({ userId: session.user.id, url }).catch(
            () => undefined,
          ),
        ),
    );
  } catch (error) {
    await Promise.all(
      createdUrls.map((url) =>
        removeStoredImage({ userId: session.user.id, url }).catch(
          () => undefined,
        ),
      ),
    );
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/bo-suu-tap");
  revalidatePath("/the-them-gan-day");
  revalidatePath("/yeu-thich");
  revalidatePath(`/the/${card.id}`);
  revalidatePath(`/the/${card.id}/chinh-sua`);
  redirect(`/the/${card.id}`);
}

export async function deleteCard(cardId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const card = await prisma.card.findFirst({
    where: { id: cardId, userId: session.user.id },
    include: {
      inventoryItems: { select: { id: true } },
      category: { select: { id: true, parentId: true } },
      images: { select: { url: true } },
    },
  });
  if (!card) throw new Error("Không tìm thấy thẻ.");

  const inventoryIds = card.inventoryItems.map((item) => item.id);
  const saleItems = inventoryIds.length
    ? await prisma.saleItem.findMany({
        where: { inventoryItemId: { in: inventoryIds } },
        select: { id: true, saleId: true },
      })
    : [];
  const saleIds = [...new Set(saleItems.map((item) => item.saleId))];

  await prisma.$transaction(async (tx) => {
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

    await tx.cardImage.deleteMany({ where: { cardId: card.id } });
    await tx.cardFavorite.deleteMany({ where: { cardId: card.id } });
    await tx.card.delete({ where: { id: card.id } });
  });

  await removeDirectory(`users/${session.user.id}/cards/${card.id}`).catch(
    () => undefined,
  );

  const imageUrls = [
    ...card.images.map((image) => image.url),
    card.referenceImage,
  ].filter((url): url is string => Boolean(url));
  await Promise.all(
    imageUrls.map((url) =>
      removeStoredImage({ userId: session.user.id!, url }).catch(
        () => undefined,
      ),
    ),
  );

  const collectionId = card.category?.parentId ?? card.category?.id;
  const seriesId = card.category?.parentId ? card.category.id : null;

  revalidatePath("/");
  revalidatePath("/bo-suu-tap");
  revalidatePath("/the-them-gan-day");
  revalidatePath("/yeu-thich");
  revalidatePath("/xem-gan-day");
  if (collectionId) {
    revalidatePath(`/bo-suu-tap/${collectionId}`);
    if (seriesId) revalidatePath(`/bo-suu-tap/${collectionId}/${seriesId}`);
  }

  redirect(collectionId ? `/bo-suu-tap/${collectionId}` : "/bo-suu-tap");
}
