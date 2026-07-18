import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
export default async function SettingsRedirect({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  const { collectionId } = await params;
  const category = await prisma.category.findFirst({
    where: { id: collectionId, userId: session.user.id },
    select: { id: true, parentId: true },
  });
  if (!category) notFound();
  redirect(
    category.parentId
      ? `/bo-suu-tap/${category.parentId}/${category.id}?edit=1`
      : `/bo-suu-tap/${category.id}?edit=1`,
  );
}
