"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function createCustomer(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) throw new Error("Tên khách hàng là bắt buộc.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email không hợp lệ.");
  }

  if (phone || email) {
    const existing = await prisma.customer.findFirst({
      where: {
        userId: session.user.id,
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
        ],
      },
      select: { name: true },
    });
    if (existing) {
      throw new Error(`Thông tin này đã thuộc khách “${existing.name}”.`);
    }
  }

  const customer = await prisma.customer.create({
    data: {
      userId: session.user.id,
      name,
      phone,
      email,
      address,
      notes,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      notes: true,
    },
  });

  revalidatePath("/ban-hang/khach-hang");
  revalidatePath("/ban-hang/tao-moi");
  return customer;
}

const paymentDirections = new Set(["CUSTOMER_TO_US", "US_TO_CUSTOMER"]);
const paymentMethods = new Set(["CASH", "BANK_TRANSFER", "EWALLET", "OTHER"]);

export async function recordCustomerPayment(
  customerId: string,
  formData: FormData,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, userId: session.user.id },
    select: { id: true },
  });
  if (!customer) throw new Error("Không tìm thấy khách hàng.");

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
      customerId: customer.id,
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
      notes,
      paidAt,
    },
  });

  revalidatePath(`/ban-hang/khach-hang/${customer.id}`);
  revalidatePath("/ban-hang/khach-hang");
  revalidatePath("/ban-hang/so-no");
}
