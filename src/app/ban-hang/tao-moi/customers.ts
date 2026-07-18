import { prisma } from "@/lib/prisma";

export function listCustomersForSale(userId: string, take = 100) {
  return prisma.customer.findMany({
    where: { userId },
    select: { id: true, name: true, phone: true, email: true },
    orderBy: { updatedAt: "desc" },
    take,
  });
}
