import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

const mediaTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string; filePath: string[] }> },
) {
  const session = await auth();
  const { userId, filePath } = await params;
  const isOwner = session?.user?.id === userId;
  const isAdmin = session?.user?.role === "ADMIN";
  if (!session?.user?.id || (!isOwner && !isAdmin)) {
    return new NextResponse(null, { status: 403 });
  }
  if (
    !filePath.length ||
    filePath.some((part) => !/^[a-zA-Z0-9._-]+$/.test(part))
  ) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const absolute = path.join(
      process.env.UPLOADS_ROOT ?? path.join(process.cwd(), "uploads"),
      "users",
      userId,
      ...filePath,
    );
    const data = await readFile(absolute);
    const extension = path.extname(filePath[filePath.length - 1] ?? "").toLowerCase();
    return new NextResponse(data, {
      headers: {
        "Content-Type": mediaTypes[extension] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
