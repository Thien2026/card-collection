import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/permissions";
import sharp from "sharp";
import convertHeic from "heic-convert";
import { temporaryImageUrl } from "@/lib/image-storage";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/upload-image";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/tiff",
]);
const allowedExtensions = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "heic",
  "heif",
  "gif",
  "tif",
  "tiff",
]);
const sharpFormats = new Set(["jpeg", "png", "webp", "avif", "gif", "tiff"]);

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Vui lòng chọn ảnh." },
        { status: 400 },
      );
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedTypes.has(file.type) && !allowedExtensions.has(extension)) {
      return NextResponse.json(
        {
          error:
            "Chỉ hỗ trợ ảnh JPG, PNG, WebP, AVIF, HEIC, GIF hoặc TIFF.",
        },
        { status: 400 },
      );
    }
    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: "Ảnh không được vượt quá 10 MB." },
        { status: 400 },
      );
    }

    const directory = path.join(
      process.env.UPLOADS_ROOT ?? path.join(process.cwd(), "uploads"),
      "users",
      user.id,
      "tmp",
    );
    await mkdir(directory, { recursive: true });
    const token = randomUUID();
    let buffer: Buffer;
    try {
      let source = Buffer.from(await file.arrayBuffer());
      const isHeic =
        file.type === "image/heic" ||
        file.type === "image/heif" ||
        extension === "heic" ||
        extension === "heif";
      if (isHeic) {
        source = Buffer.from(
          await convertHeic({
            buffer: source,
            format: "JPEG",
            quality: 0.8,
          }),
        );
      }
      const metadata = await sharp(source, { animated: false }).metadata();
      if (!sharpFormats.has(metadata.format ?? ""))
        throw new Error("UNSUPPORTED_IMAGE");
      // iPhone ảnh gốc rất lớn — thu nhỏ trước khi lưu để cropper mobile không vỡ.
      buffer = await sharp(source, { animated: false })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      return NextResponse.json(
        { error: "Tệp ảnh không hợp lệ hoặc không thể xử lý." },
        { status: 400 },
      );
    }
    await writeFile(path.join(directory, `${token}.webp`), buffer);

    return NextResponse.json(
      { token, url: temporaryImageUrl(user.id, token) },
      { status: 201 },
    );
  } catch (error) {
    const status =
      error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: "Không thể tải ảnh lên." }, { status });
  }
}
