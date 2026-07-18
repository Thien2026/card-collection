import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { prisma } from "@/lib/prisma";
import { CustomerManager } from "./customer-manager";

const PAGE_SIZE = 12;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/dang-nhap");
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const requestedPage = positiveInt(params.page);
  const where = {
    userId: session.user.id,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
            { address: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const totalCustomers = await prisma.customer.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCustomers / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const customers = await prisma.customer.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  type CustomerStats = {
    customerId: string;
    orderCount: number;
    totalSpent: number;
  };
  const customerIds = customers.map((customer) => customer.id);
  const stats = customerIds.length
    ? await prisma.$queryRaw<CustomerStats[]>(Prisma.sql`
        SELECT
          s."customerId" AS "customerId",
          COUNT(DISTINCT s.id)::int AS "orderCount",
          COALESCE(SUM(si."soldPrice"), 0)::int AS "totalSpent"
        FROM "Sale" s
        LEFT JOIN "SaleItem" si ON si."saleId" = s.id
        WHERE s."customerId" IN (${Prisma.join(customerIds)})
          AND s."createdById" = ${session.user.id}
          AND s.status IN ('COMPLETED', 'REFUNDED')
          AND si."refundedAt" IS NULL
        GROUP BY s."customerId"
      `)
    : [];
  const statsByCustomer = new Map(stats.map((row) => [row.customerId, row]));

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-5 sm:px-6 lg:py-10">
        <BackButton href="/ban-hang" label="Quay lại giao dịch" />
        <div className="mt-6">
          <CustomerManager
            initialCustomers={customers.map((customer) => ({
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              email: customer.email,
              address: customer.address,
              notes: customer.notes,
              orderCount: statsByCustomer.get(customer.id)?.orderCount ?? 0,
              totalSpent: statsByCustomer.get(customer.id)?.totalSpent ?? 0,
            }))}
            totalCustomers={totalCustomers}
            currentPage={currentPage}
            totalPages={totalPages}
            query={query}
          />
        </div>
      </main>
    </AppShell>
  );
}

function positiveInt(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
