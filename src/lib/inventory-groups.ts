import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type InventoryGroupSort =
  | "newest"
  | "oldest"
  | "name-asc"
  | "price-desc"
  | "price-asc";

type GroupKey = {
  cardId: string;
  condition: string;
  itemType: string;
  costPrice: number;
};

function groupKey(group: GroupKey) {
  return `${group.cardId}::${group.condition}::${group.itemType}::${group.costPrice}`;
}

/**
 * Paginate inventory by (cardId, condition, itemType, costPrice) groups.
 * Uses lightweight groupBy for totals/order, then loads full rows only for the page.
 */
export async function paginateInventoryGroups<
  TInclude extends Prisma.InventoryItemInclude,
>({
  where,
  sort,
  page,
  pageSize,
  include,
}: {
  where: Prisma.InventoryItemWhereInput;
  sort: InventoryGroupSort;
  page: number;
  pageSize: number;
  include: TInclude;
}) {
  const rawGroups = await prisma.inventoryItem.groupBy({
    by: ["cardId", "condition", "itemType", "costPrice"],
    where,
    _count: { _all: true },
    _max: { createdAt: true },
  });

  let ordered = rawGroups;

  if (sort === "name-asc") {
    const cardIds = [...new Set(rawGroups.map((group) => group.cardId))];
    const cards = cardIds.length
      ? await prisma.card.findMany({
          where: { id: { in: cardIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(cards.map((card) => [card.id, card.name]));
    ordered = [...rawGroups].sort((a, b) =>
      (nameById.get(a.cardId) ?? "").localeCompare(
        nameById.get(b.cardId) ?? "",
        "vi",
      ),
    );
  } else if (sort === "price-desc") {
    ordered = [...rawGroups].sort((a, b) => b.costPrice - a.costPrice);
  } else if (sort === "price-asc") {
    ordered = [...rawGroups].sort((a, b) => a.costPrice - b.costPrice);
  } else if (sort === "oldest") {
    ordered = [...rawGroups].sort(
      (a, b) =>
        (a._max.createdAt?.getTime() ?? 0) - (b._max.createdAt?.getTime() ?? 0),
    );
  } else {
    ordered = [...rawGroups].sort(
      (a, b) =>
        (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0),
    );
  }

  const totalGroups = ordered.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageGroups = ordered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  type Item = Prisma.InventoryItemGetPayload<{ include: TInclude }>;

  if (!pageGroups.length) {
    return {
      groups: [] as Array<{ item: Item; quantity: number }>,
      totalGroups,
      totalPages,
      page: safePage,
    };
  }

  const quantityByKey = new Map(
    pageGroups.map((group) => [groupKey(group), group._count._all]),
  );

  const rows = await prisma.inventoryItem.findMany({
    where: {
      AND: [
        where,
        {
          OR: pageGroups.map((group) => ({
            cardId: group.cardId,
            condition: group.condition,
            itemType: group.itemType,
            costPrice: group.costPrice,
          })),
        },
      ],
    },
    include,
    orderBy: { createdAt: "desc" },
  });

  const representative = new Map<string, Item>();
  for (const row of rows) {
    const key = groupKey(row);
    if (!representative.has(key)) representative.set(key, row);
  }

  const groups = pageGroups
    .map((group) => {
      const key = groupKey(group);
      const item = representative.get(key);
      if (!item) return null;
      return { item, quantity: quantityByKey.get(key) ?? 1 };
    })
    .filter((row): row is { item: Item; quantity: number } => Boolean(row));

  return { groups, totalGroups, totalPages, page: safePage };
}
