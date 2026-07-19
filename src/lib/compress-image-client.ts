/** Nén ảnh trên client trước khi upload — ảnh DT thường 3–12 MB. */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isProbablyHeic(file: File) {
  const ext = extensionOf(file.name);
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    ext === "heic" ||
    ext === "heif"
  );
}

/**
 * Resize + JPEG hoá trên máy. Giảm băng thông và bỏ HEIC nặng trên server khi browser decode được.
 * Nếu lỗi (browser không đọc HEIC) → trả file gốc.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  // Ảnh nhỏ / đã webp nhỏ: khỏi đụng.
  if (file.size < 350_000 && !isProbablyHeic(file)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
