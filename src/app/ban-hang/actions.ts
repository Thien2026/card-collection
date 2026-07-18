"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSalesChannel } from "@/lib/sales-channels";

function saleCode() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = randomUUID().slice(0, 4).toUpperCase();
  return `GD-${stamp}-${rand}`;
}

function parsePositiveInt(value: FormDataEntryValue | null) {
  const amount = Number(value);
  return Number.isInteger(amount) && amount >= 0 ? amount : null;
}

export async function createSale(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const customerId =
    String(formData.get("customerId") ?? "").trim() || null;
  let customerName =
    String(formData.get("customerName") ?? "").trim() || null;
  const channelValue = String(formData.get("salesChannel") ?? "").trim();
  const salesChannel = channelValue || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const finalize = String(formData.get("finalize") ?? "") === "1";

  const itemIds = formData.getAll("itemId").map(String).filter(Boolean);
  if (!itemIds.length) throw new Error("Chọn ít nhất một mục để bán.");

  const soldPrices = itemIds.map((id) => {
    const price = parsePositiveInt(formData.get(`soldPrice_${id}`));
    if (price === null) throw new Error("Giá bán không hợp lệ.");
    return { inventoryItemId: id, soldPrice: price };
  });

  const expenseAmount = parsePositiveInt(formData.get("expenseAmount")) ?? 0;
  const expenseLabel =
    String(formData.get("expenseLabel") ?? "").trim() || "Chi phí khác";
  const totalAmount = soldPrices.reduce((sum, row) => sum + row.soldPrice, 0);
  const paidAmount = finalize
    ? parsePositiveInt(formData.get("paidAmount"))
    : 0;
  const paymentMethod = String(
    formData.get("paymentMethod") ?? "BANK_TRANSFER",
  );
  const allowedPaymentMethods = new Set([
    "CASH",
    "BANK_TRANSFER",
    "EWALLET",
    "OTHER",
  ]);

  if (salesChannel && !isSalesChannel(salesChannel)) {
    throw new Error("Kênh bán không hợp lệ.");
  }
  if (finalize && paidAmount === null) {
    throw new Error("Số tiền thanh toán không hợp lệ.");
  }
  if (finalize && !allowedPaymentMethods.has(paymentMethod)) {
    throw new Error("Phương thức thanh toán không hợp lệ.");
  }
  if (finalize && paidAmount !== totalAmount && !customerId) {
    throw new Error(
      "Chọn khách hàng để theo dõi phần thanh toán thiếu hoặc thừa.",
    );
  }

  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, userId: session.user.id },
      select: { name: true },
    });
    if (!customer) throw new Error("Khách hàng không hợp lệ.");
    customerName = customer.name;
  }

  const inventoryItems = await prisma.inventoryItem.findMany({
    where: {
      id: { in: itemIds },
      userId: session.user.id,
      status: "AVAILABLE",
    },
  });
  if (inventoryItems.length !== itemIds.length) {
    throw new Error("Một số mục không còn sẵn sàng để bán.");
  }

  const activeLinks = await prisma.saleItem.findMany({
    where: {
      inventoryItemId: { in: itemIds },
      refundedAt: null,
      sale: { status: { in: ["DRAFT", "COMPLETED"] } },
    },
    select: { inventoryItemId: true, sale: { select: { code: true } } },
  });
  if (activeLinks.length) {
    throw new Error(
      `Một số mục đang nằm trong đơn ${activeLinks[0]?.sale.code ?? ""} chưa hoàn. Không thể bán lại.`,
    );
  }

  const costById = new Map(
    inventoryItems.map((item) => [item.id, item.costPrice]),
  );

  let sale;
  try {
    sale = await prisma.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        code: saleCode(),
        status: finalize ? "COMPLETED" : "DRAFT",
        customerId,
        customerName,
        salesChannel,
        notes,
        createdById: session.user.id,
        completedAt: finalize ? new Date() : null,
        items: {
          create: soldPrices.map((row) => ({
            inventoryItemId: row.inventoryItemId,
            soldPrice: row.soldPrice,
            costPrice: costById.get(row.inventoryItemId) ?? 0,
          })),
        },
        ...(expenseAmount > 0
          ? {
              expenses: {
                create: {
                  type: "OTHER" as const,
                  label: expenseLabel,
                  amount: expenseAmount,
                },
              },
            }
          : {}),
        ...(finalize && customerId && (paidAmount ?? 0) > 0
          ? {
              payments: {
                create: {
                  customerId,
                  direction: "CUSTOMER_TO_US" as const,
                  method:
                    paymentMethod === "CASH"
                      ? ("CASH" as const)
                      : paymentMethod === "EWALLET"
                        ? ("EWALLET" as const)
                        : paymentMethod === "OTHER"
                          ? ("OTHER" as const)
                          : ("BANK_TRANSFER" as const),
                  amount: paidAmount ?? 0,
                  notes: "Thanh toán khi tạo đơn",
                },
              },
            }
          : {}),
      },
    });

    await tx.inventoryItem.updateMany({
      where: { id: { in: itemIds }, userId: session.user.id },
      data: { status: finalize ? "SOLD" : "RESERVED" },
    });

    return created;
  });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new Error(
        "Một số mục đã từng gắn đơn cũ. Thử làm mới trang rồi bán lại, hoặc hoàn đơn cũ trước.",
      );
    }
    throw error;
  }

  revalidatePath("/ban-hang");
  revalidatePath("/");
  revalidatePath("/bo-suu-tap");
  for (const item of inventoryItems) {
    revalidatePath(`/the/${item.cardId}`);
  }
  if (customerId) {
    revalidatePath(`/ban-hang/khach-hang/${customerId}`);
    revalidatePath("/ban-hang/khach-hang");
    revalidatePath("/ban-hang/so-no");
  }

  redirect(`/ban-hang/${sale.id}`);
}

export async function completeSale(saleId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, createdById: session.user.id },
    include: { items: { select: { inventoryItemId: true } } },
  });
  if (!sale) throw new Error("Không tìm thấy giao dịch.");
  if (sale.status !== "DRAFT") {
    throw new Error("Chỉ hoàn tất được đơn đang ở trạng thái nháp.");
  }
  if (!sale.items.length) throw new Error("Đơn chưa có mục nào.");

  const inventoryIds = sale.items.map((item) => item.inventoryItemId);

  await prisma.$transaction([
    prisma.sale.update({
      where: { id: sale.id },
      data: { status: "COMPLETED", completedAt: new Date(), cancelledAt: null },
    }),
    prisma.inventoryItem.updateMany({
      where: { id: { in: inventoryIds }, userId: session.user.id },
      data: { status: "SOLD" },
    }),
  ]);

  revalidatePath("/ban-hang");
  revalidatePath(`/ban-hang/${sale.id}`);
  revalidatePath("/");
}

export async function cancelSale(saleId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, createdById: session.user.id },
    include: { items: { select: { inventoryItemId: true } } },
  });
  if (!sale) throw new Error("Không tìm thấy giao dịch.");
  if (sale.status === "CANCELLED") return;
  if (sale.status === "COMPLETED") {
    throw new Error("Không thể huỷ đơn đã hoàn tất. Hãy tạo giao dịch điều chỉnh nếu cần.");
  }

  const inventoryIds = sale.items.map((item) => item.inventoryItemId);

  await prisma.$transaction([
    prisma.sale.update({
      where: { id: sale.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    }),
    prisma.inventoryItem.updateMany({
      where: { id: { in: inventoryIds }, userId: session.user.id },
      data: { status: "AVAILABLE" },
    }),
  ]);

  revalidatePath("/ban-hang");
  revalidatePath(`/ban-hang/${sale.id}`);
  revalidatePath("/");
}

export async function deleteSale(saleId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, createdById: session.user.id },
    include: { items: { select: { inventoryItemId: true } } },
  });
  if (!sale) throw new Error("Không tìm thấy giao dịch.");
  if (sale.status === "COMPLETED") {
    throw new Error("Không thể xoá đơn đã hoàn tất.");
  }

  const inventoryIds = sale.items.map((item) => item.inventoryItemId);

  await prisma.$transaction(async (tx) => {
    if (inventoryIds.length && sale.status === "DRAFT") {
      await tx.inventoryItem.updateMany({
        where: { id: { in: inventoryIds }, userId: session.user.id },
        data: { status: "AVAILABLE" },
      });
    }
    await tx.saleExpense.deleteMany({ where: { saleId: sale.id } });
    await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
    await tx.sale.delete({ where: { id: sale.id } });
  });

  revalidatePath("/ban-hang");
  revalidatePath("/");
  redirect("/ban-hang");
}

const paymentDirections = new Set(["CUSTOMER_TO_US", "US_TO_CUSTOMER"]);
const paymentMethods = new Set(["CASH", "BANK_TRANSFER", "EWALLET", "OTHER"]);

export async function recordSalePayment(saleId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, createdById: session.user.id },
    select: {
      id: true,
      code: true,
      status: true,
      customerId: true,
      customerName: true,
    },
  });
  if (!sale) throw new Error("Không tìm thấy giao dịch.");
  if (sale.status === "CANCELLED" || sale.status === "REFUNDED") {
    throw new Error("Không thể thanh toán cho đơn đã huỷ hoặc đã hoàn.");
  }
  if (!sale.customerId) {
    throw new Error(
      "Đơn khách lẻ không gắn khách hàng. Hãy gắn khách trước khi trả góp nhiều lần.",
    );
  }

  const formCustomerId = String(formData.get("customerId") ?? "").trim();
  if (formCustomerId && formCustomerId !== sale.customerId) {
    throw new Error("Khách hàng không khớp với đơn.");
  }

  const amount = Number(formData.get("amount"));
  const direction = String(formData.get("direction") ?? "");
  const method = String(formData.get("method") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const paidAtValue = String(formData.get("paidAt") ?? "").trim();
  const paidAt = paidAtValue ? new Date(`${paidAtValue}T12:00:00`) : new Date();

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Số tiền thanh toán phải lớn hơn 0.");
  }
  if (!paymentDirections.has(direction)) {
    throw new Error("Chiều thanh toán không hợp lệ.");
  }
  if (!paymentMethods.has(method)) {
    throw new Error("Phương thức thanh toán không hợp lệ.");
  }
  if (Number.isNaN(paidAt.getTime())) {
    throw new Error("Ngày thanh toán không hợp lệ.");
  }

  await prisma.customerPayment.create({
    data: {
      customerId: sale.customerId,
      saleId: sale.id,
      amount,
      direction:
        direction === "CUSTOMER_TO_US" ? "CUSTOMER_TO_US" : "US_TO_CUSTOMER",
      method:
        method === "CASH"
          ? "CASH"
          : method === "BANK_TRANSFER"
            ? "BANK_TRANSFER"
            : method === "EWALLET"
              ? "EWALLET"
              : "OTHER",
      notes: notes ?? `Thanh toán đơn ${sale.code}`,
      paidAt,
    },
  });

  revalidatePath(`/ban-hang/${sale.id}`);
  revalidatePath("/ban-hang");
  revalidatePath(`/ban-hang/khach-hang/${sale.customerId}`);
  revalidatePath("/ban-hang/so-no");
}

export async function refundSale(saleId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, createdById: session.user.id },
    include: {
      items: {
        select: {
          id: true,
          soldPrice: true,
          inventoryItemId: true,
          refundedAt: true,
          inventoryItem: { select: { cardId: true } },
        },
      },
    },
  });
  if (!sale) throw new Error("Không tìm thấy giao dịch.");
  if (sale.status !== "COMPLETED" && sale.status !== "REFUNDED") {
    throw new Error("Chỉ hoàn được đơn đã hoàn tất.");
  }

  const activeItems = sale.items.filter((item) => !item.refundedAt);
  if (!activeItems.length) {
    throw new Error("Đơn đã hoàn hết các mục.");
  }

  const selectedIds = new Set(
    formData.getAll("saleItemId").map(String).filter(Boolean),
  );
  if (!selectedIds.size) {
    throw new Error("Chọn ít nhất một mục để hoàn.");
  }

  const toRefund = activeItems.filter((item) => selectedIds.has(item.id));
  if (toRefund.length !== selectedIds.size) {
    throw new Error("Một số mục không hợp lệ hoặc đã hoàn trước đó.");
  }

  const refundAmount = parsePositiveInt(formData.get("refundAmount"));
  if (refundAmount === null) {
    throw new Error("Số tiền trả khách không hợp lệ.");
  }
  const paymentMethod = String(formData.get("paymentMethod") ?? "BANK_TRANSFER");
  if (
    sale.customerId &&
    refundAmount > 0 &&
    !paymentMethods.has(paymentMethod)
  ) {
    throw new Error("Phương thức thanh toán không hợp lệ.");
  }

  const expenseAmount = parsePositiveInt(formData.get("expenseAmount")) ?? 0;
  const expenseLabel =
    String(formData.get("expenseLabel") ?? "").trim() || "Chi phí hoàn đơn";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const inventoryIds = toRefund.map((item) => item.inventoryItemId);
  const cardIds = [
    ...new Set(toRefund.map((item) => item.inventoryItem.cardId)),
  ];
  const now = new Date();
  const remainingAfter =
    activeItems.length - toRefund.length === 0;

  await prisma.$transaction(async (tx) => {
    const refund = await tx.saleRefund.create({
      data: {
        saleId: sale.id,
        notes,
        refundedAmount: refundAmount,
      },
    });

    const sideEffects: Promise<unknown>[] = [
      tx.saleItem.updateMany({
        where: {
          id: { in: toRefund.map((item) => item.id) },
          saleId: sale.id,
        },
        data: { refundedAt: now, refundId: refund.id },
      }),
      tx.inventoryItem.updateMany({
        where: { id: { in: inventoryIds }, userId: session.user.id },
        data: { status: "AVAILABLE" },
      }),
    ];

    if (expenseAmount > 0) {
      sideEffects.push(
        tx.saleExpense.create({
          data: {
            saleId: sale.id,
            type: "REFUND",
            label: expenseLabel,
            amount: expenseAmount,
          },
        }),
      );
    }

    if (sale.customerId && refundAmount > 0) {
      sideEffects.push(
        tx.customerPayment.create({
          data: {
            customerId: sale.customerId,
            saleId: sale.id,
            direction: "US_TO_CUSTOMER",
            method:
              paymentMethod === "CASH"
                ? "CASH"
                : paymentMethod === "EWALLET"
                  ? "EWALLET"
                  : paymentMethod === "OTHER"
                    ? "OTHER"
                    : "BANK_TRANSFER",
            amount: refundAmount,
            notes: notes
              ? `Hoàn đơn ${sale.code} · ${notes}`
              : `Hoàn đơn ${sale.code}`,
            paidAt: now,
          },
        }),
      );
    }

    if (remainingAfter) {
      sideEffects.push(
        tx.sale.update({
          where: { id: sale.id },
          data: { status: "REFUNDED", refundedAt: now },
        }),
      );
    }

    await Promise.all(sideEffects);
  });

  // Trang đang mở — invalidate ngay để router.refresh() lấy data mới.
  revalidatePath(`/ban-hang/${sale.id}`);
  revalidatePath("/ban-hang");

  // Các trang khác không cần chặn response hoàn đơn.
  const customerId = sale.customerId;
  after(() => {
    revalidatePath("/ban-hang/bao-cao");
    revalidatePath("/");
    revalidatePath("/bo-suu-tap");
    for (const cardId of cardIds) {
      revalidatePath(`/the/${cardId}`);
    }
    if (customerId) {
      revalidatePath(`/ban-hang/khach-hang/${customerId}`);
      revalidatePath("/ban-hang/khach-hang");
      revalidatePath("/ban-hang/so-no");
    }
  });
}

