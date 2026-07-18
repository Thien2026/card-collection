"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  moveTemporaryImage,
  removeDirectory,
  type ImageCrop,
} from "@/lib/image-storage";
import { IMAGE_UPLOAD_MAX_FILES } from "@/lib/upload-image";

type PendingImage = { token: string; crop: ImageCrop | null };

function parseImages(value: FormDataEntryValue | null): PendingImage[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > IMAGE_UPLOAD_MAX_FILES)
      throw new Error("INVALID_IMAGES");
    return parsed.map((entry) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        !("token" in entry) ||
        typeof entry.token !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(entry.token)
      )
        throw new Error("INVALID_IMAGES");
      const crop =
        "crop" in entry && entry.crop && typeof entry.crop === "object"
          ? (entry.crop as ImageCrop)
          : null;
      return { token: entry.token, crop };
    });
  } catch {
    throw new Error("Danh sách ảnh không hợp lệ.");
  }
}

export async function createInventoryCard(formData: FormData) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");

  const name = String(formData.get("name") ?? "").trim();
  const requestedCollectionId = String(
    formData.get("collectionId") ?? "",
  ).trim();
  const requestedSeriesId = String(formData.get("seriesId") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const images = parseImages(formData.get("images"));
  const costPrice = Number(formData.get("costPrice") ?? 0);
  const quantity = Number(formData.get("quantity") ?? 1);
  const acquiredAtValue = String(formData.get("acquiredAt") ?? "").trim();
  const acquiredAt = acquiredAtValue
    ? new Date(`${acquiredAtValue}T00:00:00.000Z`)
    : null;
  const requestedType = String(formData.get("itemType") ?? "SINGLE_CARD");
  const itemType =
    requestedType === "SEALED_PRODUCT" || requestedType === "ACCESSORY"
      ? requestedType
      : "SINGLE_CARD";

  if (
    !name ||
    !Number.isInteger(costPrice) ||
    costPrice < 0 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    (acquiredAt && Number.isNaN(acquiredAt.getTime()))
  ) {
    throw new Error("Vui lòng nhập tên card, giá mua và số lượng hợp lệ.");
  }

  if (!requestedCollectionId || !requestedSeriesId) {
    throw new Error("Vui lòng chọn bộ sưu tập và series trước khi tạo thẻ.");
  }

  const series = await prisma.category.findFirst({
    where: {
      id: requestedSeriesId,
      parentId: requestedCollectionId,
      userId: session.user.id,
      parent: { id: requestedCollectionId, userId: session.user.id, parentId: null },
    },
    select: { id: true, parentId: true },
  });
  if (!series?.parentId) {
    throw new Error("Bộ sưu tập hoặc series không hợp lệ.");
  }
  if (categoryId && categoryId !== series.id) {
    throw new Error("Bộ sưu tập hoặc series không hợp lệ.");
  }

  const collectionId = series.parentId;
  const seriesId = series.id;
  const resolvedCategoryId = seriesId;

  const condition = String(formData.get("condition") ?? "NM");
  const itemIds = Array.from({ length: quantity }, () => randomUUID());
  let cardId: string | null = null;
  let imageDirectory: string | null = null;

  try {
    const card = await prisma.$transaction(async (tx) => {
      const createdCard = await tx.card.create({
        data: {
          name,
          userId: session.user.id,
          game: String(formData.get("game") ?? "").trim() || null,
          setName: String(formData.get("setName") ?? "").trim() || null,
          cardNumber: String(formData.get("cardNumber") ?? "").trim() || null,
          characterName:
            String(formData.get("characterName") ?? "").trim() || null,
          rarity: String(formData.get("rarity") ?? "").trim() || null,
          categoryId: resolvedCategoryId,
          notes: String(formData.get("notes") ?? "").trim() || null,
        },
      });
      await tx.inventoryItem.createMany({
        data: itemIds.map((id, index) => ({
          id,
          sku: `CARD-${Date.now()}-${index + 1}-${randomUUID().slice(0, 6).toUpperCase()}`,
          userId: session.user.id,
          cardId: createdCard.id,
          condition,
          itemType,
          costPrice,
          acquiredAt,
          storageLocation:
            String(formData.get("storageLocation") ?? "").trim() || null,
          notes: String(formData.get("notes") ?? "").trim() || null,
        })),
      });
      return createdCard;
    });
    cardId = card.id;

    if (images.length) {
      imageDirectory = `users/${session.user.id}/cards/${card.id}`;
      const imageUrls: string[] = [];
      for (const [index, image] of images.entries()) {
        const imageUrl = await moveTemporaryImage({
          userId: session.user.id,
          token: image.token,
          crop: image.crop,
          destination: `${imageDirectory}/${index + 1}.webp`,
        });
        if (imageUrl) imageUrls.push(imageUrl);
      }
      await prisma.cardImage.createMany({
        data: imageUrls.map((url, sortOrder) => ({
          cardId: card.id,
          url,
          sortOrder,
        })),
      });
      const imageUrl = imageUrls[0] ?? null;
      await prisma.inventoryItem.updateMany({
        where: { id: { in: itemIds }, userId: session.user.id },
        data: { imageUrl },
      });
      await prisma.card.update({
        where: { id: card.id },
        data: { referenceImage: imageUrl },
      });
    }
  } catch (error) {
    if (cardId)
      await prisma.card
        .delete({ where: { id: cardId } })
        .catch(() => undefined);
    if (imageDirectory)
      await removeDirectory(imageDirectory).catch(() => undefined);
    throw error;
  }

  revalidatePath("/");
  revalidatePath("/bo-suu-tap");
  revalidatePath(`/bo-suu-tap/${collectionId}`);
  revalidatePath(`/bo-suu-tap/${collectionId}/${seriesId}`);
  redirect(`/bo-suu-tap/${collectionId}/${seriesId}`);
}
