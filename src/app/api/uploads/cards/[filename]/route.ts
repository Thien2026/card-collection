import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const mediaTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(filename)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const extension = path.extname(filename);
    const data = await readFile(
      path.join(
        process.env.UPLOADS_ROOT ?? path.join(process.cwd(), "uploads"),
        "cards",
        filename,
      ),
    );
    return new NextResponse(data, {
      headers: {
        "Content-Type": mediaTypes[extension],
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
