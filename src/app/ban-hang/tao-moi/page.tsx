import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { Pagination } from "@/components/pagination";
import { prisma } from "@/lib/prisma";
import { CreateSaleForm } from "./create-sale-form";
import { listCustomersForSale } from "./customers";

const STOCK_PAGE_SIZE = 60;
const CUSTOMER_LIMIT = 100;

export default async function CreateSalePage({
  searchParams,
}: {
  searchParams: Promise<{
    itemId?: string;
    cardId?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/dang-nhap");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const requestedPage =
    params.page && /^\d+$/.test(params.page)
      ? Math.max(1, Number(params.page))
      : 1;

  const stockWhere: Prisma.InventoryItemWhereInput = {
    userId: session.user.id,
    status: "AVAILABLE",
    ...(q
      ? {
          OR: [
            { sku: { contains: q, mode: "insensitive" } },
            {
              card: {
                name: { contains: q, mode: "insensitive" },
              },
            },
            {
              card: {
                category: {
                  name: { contains: q, mode: "insensitive" },
                },
              },
            },
            {
              card: {
                category: {
                  parent: {
                    name: { contains: q, mode: "insensitive" },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const stockCount = await prisma.inventoryItem.count({ where: stockWhere });
  const totalPages = Math.max(1, Math.ceil(stockCount / STOCK_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const stockInclude = {
    card: {
      select: {
        id: true,
        name: true,
        referenceImage: true,
        category: {
          select: {
            name: true,
            parent: { select: { name: true } },
          },
        },
      },
    },
  } as const;

  let stock = await prisma.inventoryItem.findMany({
    where: stockWhere,
    include: stockInclude,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * STOCK_PAGE_SIZE,
    take: STOCK_PAGE_SIZE,
  });

  const preferItemId = params.itemId;
  const preferCardId = params.cardId;
  if (
    preferItemId &&
    !stock.some((item) => item.id === preferItemId)
  ) {
    const preferred = await prisma.inventoryItem.findFirst({
      where: {
        id: preferItemId,
        userId: session.user.id,
        status: "AVAILABLE",
      },
      include: stockInclude,
    });
    if (preferred) stock = [preferred, ...stock];
  } else if (
    preferCardId &&
    !stock.some((item) => item.cardId === preferCardId)
  ) {
    const preferred = await prisma.inventoryItem.findFirst({
      where: {
        cardId: preferCardId,
        userId: session.user.id,
        status: "AVAILABLE",
      },
      include: stockInclude,
      orderBy: { createdAt: "desc" },
    });
    if (preferred) stock = [preferred, ...stock];
  }

  const customers = await listCustomersForSale(
    session.user.id,
    CUSTOMER_LIMIT,
  );

  const preselectedItemId =
    preferItemId ??
    (preferCardId
      ? stock.find((item) => item.cardId === preferCardId)?.id
      : undefined);

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-5 sm:px-6 lg:py-10">
        <header className="mb-5 flex items-center justify-between gap-3">
          <BackButton href="/ban-hang" label="Quay lại giao dịch" />
        </header>
        <div className="mb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-accent-text">
            Bán hàng
          </p>
          <h1 className="mt-1 text-2xl font-black text-primary">
            Tạo giao dịch
          </h1>
          <p className="mt-1 text-xs text-muted">
            Chọn mục trong kho, nhập giá bán rồi lưu nháp hoặc bán ngay.
          </p>
        </div>
        <CreateSaleForm
          items={stock.map((item) => ({
            id: item.id,
            sku: item.sku,
            costPrice: item.costPrice,
            condition: item.condition,
            imageUrl: item.imageUrl,
            card: item.card,
          }))}
          preselectedItemId={preselectedItemId}
          initialCustomers={customers}
          stockQuery={q}
          stockPage={page}
          stockTotalPages={totalPages}
          stockTotal={stockCount}
        />
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/ban-hang/tao-moi"
          params={{
            q: q || undefined,
            itemId: preferItemId,
            cardId: preferCardId,
          }}
        />
      </main>
    </AppShell>
  );
}
