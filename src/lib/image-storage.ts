import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const uploadsRoot = process.env.UPLOADS_ROOT ?? path.join(process.cwd(), "uploads");

export type ImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export function temporaryImageUrl(userId: string, token: string) {
  return `/api/uploads/users/${userId}/tmp/${token}.webp`;
}

function toPublicUrl(destination: string) {
  return `/api/uploads/${destination.replaceAll(path.sep, "/")}`;
}

function resolveUserUploadPath(userId: string, url: string) {
  const prefix = `/api/uploads/users/${userId}/`;
  if (!url.startsWith(prefix)) return null;
  const parts = url.slice(prefix.length).split("/");
  if (
    !parts.length ||
    parts.some((part) => !part || !/^[a-zA-Z0-9._-]+$/.test(part))
  )
    return null;
  return path.join(uploadsRoot, "users", userId, ...parts);
}

export async function moveTemporaryImage({
  userId,
  token,
  destination,
  crop,
}: {
  userId: string;
  token: string | null;
  destination: string;
  crop?: ImageCrop | null;
}) {
  if (!token) return null;
  const source = path.join(
    uploadsRoot,
    "users",
    userId,
    "tmp",
    `${token}.webp`,
  );
  const target = path.join(uploadsRoot, destination);
  await mkdir(path.dirname(target), { recursive: true });
  if (
    crop &&
    [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) &&
    crop.width > 0 &&
    crop.height > 0
  ) {
    const input = await readFile(source);
    const output = await applyImageCrop(input, crop);
    await writeFile(target, output);
    await rm(source, { force: true });
  } else {
    await rm(target, { force: true });
    await rename(source, target);
  }
  return toPublicUrl(destination);
}

async function applyImageCrop(input: Buffer, crop: ImageCrop) {
  const rotation = ((Math.round(crop.rotation ?? 0) % 360) + 360) % 360;
  const rotatedBuffer =
    rotation === 0
      ? input
      : await sharp(input).rotate(rotation).toBuffer();

  try {
    const metadata = await sharp(rotatedBuffer).metadata();
    const imgW = metadata.width;
    const imgH = metadata.height;
    if (!imgW || !imgH) {
      return sharp(rotatedBuffer).webp({ quality: 86 }).toBuffer();
    }

    const cropX = Math.round(crop.x);
    const cropY = Math.round(crop.y);
    const cropW = Math.max(1, Math.round(crop.width));
    const cropH = Math.max(1, Math.round(crop.height));

    // Giao giữa vùng crop và ảnh thật.
    const srcLeft = Math.max(0, cropX);
    const srcTop = Math.max(0, cropY);
    const srcRight = Math.min(imgW, cropX + cropW);
    const srcBottom = Math.min(imgH, cropY + cropH);
    const srcW = srcRight - srcLeft;
    const srcH = srcBottom - srcTop;

    // Zoom nhỏ hơn 1 thường làm crop tràn ra ngoài — pad nền thay vì extract lỗi.
    if (srcW <= 0 || srcH <= 0) {
      return sharp(rotatedBuffer)
        .resize(cropW, cropH, {
          fit: "contain",
          background: { r: 15, g: 23, b: 42, alpha: 1 },
        })
        .webp({ quality: 86 })
        .toBuffer();
    }

    const padLeft = Math.max(0, -cropX);
    const padTop = Math.max(0, -cropY);
    const padRight = Math.max(0, cropX + cropW - imgW);
    const padBottom = Math.max(0, cropY + cropH - imgH);

    let pipeline = sharp(rotatedBuffer).extract({
      left: srcLeft,
      top: srcTop,
      width: srcW,
      height: srcH,
    });

    if (padLeft || padTop || padRight || padBottom) {
      pipeline = pipeline.extend({
        left: padLeft,
        top: padTop,
        right: padRight,
        bottom: padBottom,
        background: { r: 15, g: 23, b: 42, alpha: 1 },
      });
    }

    const padded = await pipeline.toBuffer();
    const paddedMeta = await sharp(padded).metadata();
    if (paddedMeta.width === cropW && paddedMeta.height === cropH) {
      return sharp(padded).webp({ quality: 86 }).toBuffer();
    }

    return sharp(padded)
      .resize(cropW, cropH, { fit: "fill" })
      .webp({ quality: 86 })
      .toBuffer();
  } catch {
    // Fallback an toàn: chứa trọn ảnh trong khung tỉ lệ thẻ.
    const cropW = Math.max(1, Math.round(crop.width));
    const cropH = Math.max(1, Math.round(crop.height));
    return sharp(rotatedBuffer)
      .resize(cropW, cropH, {
        fit: "contain",
        background: { r: 15, g: 23, b: 42, alpha: 1 },
      })
      .webp({ quality: 86 })
      .toBuffer();
  }
}

export async function copyStoredImage({
  userId,
  url,
  destination,
}: {
  userId: string;
  url: string;
  destination: string;
}) {
  const source = resolveUserUploadPath(userId, url);
  if (!source) return url;
  const target = path.join(uploadsRoot, destination);
  if (path.resolve(source) === path.resolve(target)) return url;
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return toPublicUrl(destination);
}

export async function removeDirectory(relativePath: string) {
  await rm(path.join(uploadsRoot, relativePath), {
    recursive: true,
    force: true,
  });
}

export async function removeStoredImage({
  userId,
  url,
}: {
  userId: string;
  url: string;
}) {
  const source = resolveUserUploadPath(userId, url);
  if (!source) return;
  await rm(source, { force: true });
}
