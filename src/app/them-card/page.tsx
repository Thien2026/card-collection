import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AddCardFlow } from "./add-card-flow";

export default async function AddCardPage({
  searchParams,
}: {
  searchParams: Promise<{ collectionId?: string; seriesId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");

  const [categories, query] = await Promise.all([
    prisma.category.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, parentId: true },
    }),
    searchParams,
  ]);

  const collection = categories.find(
    (category) =>
      category.id === query.collectionId && category.parentId === null,
  );
  const series = categories.find(
    (category) =>
      category.id === query.seriesId && category.parentId === collection?.id,
  );

  return (
    <AddCardFlow
      categories={categories}
      initialCollectionId={collection?.id ?? ""}
      initialSeriesId={series?.id ?? ""}
    />
  );
}
