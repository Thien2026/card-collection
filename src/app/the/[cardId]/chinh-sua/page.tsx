import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Save } from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { prisma } from "@/lib/prisma";
import { MultiImageUpload } from "@/app/them-card/multi-image-upload";
import { updateCard } from "../actions";

const conditions = [
  { value: "MINT", code: "M", label: "Mới hoàn toàn" },
  { value: "NM", code: "NM", label: "Gần như mới" },
  { value: "LP", code: "LP", label: "Ít dấu sử dụng" },
  { value: "MP", code: "MP", label: "Hơi cũ" },
  { value: "HP", code: "HP", label: "Nhiều dấu sử dụng" },
  { value: "DMG", code: "DMG", label: "Hư hại" },
] as const;

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  const { cardId } = await params;
  const card = await prisma.card.findFirst({
    where: { id: cardId, userId: session.user.id },
    include: {
      category: {
        select: {
          name: true,
          parent: { select: { name: true } },
        },
      },
      images: { orderBy: { sortOrder: "asc" } },
      inventoryItems: {
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!card) notFound();

  const activeItems = card.inventoryItems.filter(
    (item) => item.status === "AVAILABLE" || item.status === "RESERVED",
  );
  const representative = activeItems[0] ?? card.inventoryItems[0];
  const image =
    card.images[0]?.url ?? representative?.imageUrl ?? card.referenceImage;
  const action = updateCard.bind(null, card.id);

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <main className="mx-auto min-h-screen max-w-2xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-10">
        <header className="flex items-center gap-3">
          <BackButton href={`/the/${card.id}`} label="Hủy chỉnh sửa" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black text-primary">
              Chỉnh sửa card
            </h1>
            <p className="mt-0.5 truncate text-[10px] text-muted">
              {card.category?.parent?.name
                ? `${card.category.parent.name} · ${card.category.name}`
                : card.category?.name || "Chưa phân loại"}
            </p>
          </div>
        </header>

        <form action={action} className="mt-6 space-y-4">
          <section className="flex items-center gap-4 rounded-2xl border border-app-border bg-surface p-4">
            <div className="grid h-24 w-[68px] shrink-0 place-items-center overflow-hidden rounded-xl bg-panel">
              {image ? (
                <img
                  src={image}
                  alt={card.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl text-muted">✦</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-primary">{card.name}</p>
              <p className="mt-1 text-[10px] text-muted">
                {activeItems.length} mục đang hoạt động
              </p>
              <p className="mt-2 text-[10px] leading-4 text-muted">
                Thông tin sở hữu bên dưới được áp dụng cho tất cả mục khả dụng
                và đang giữ chỗ của card này.
              </p>
            </div>
          </section>

          <MultiImageUpload
            initialImages={
              card.images.length
                ? card.images.map((entry) => ({
                    id: entry.id,
                    url: entry.url,
                  }))
                : image
                  ? [{ id: "legacy", url: image }]
                  : []
            }
          />

          <FormSection title="Thông tin thẻ">
            <Field
              name="name"
              label="Tên card *"
              defaultValue={card.name}
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                name="setName"
                label="Tên set / phiên bản"
                defaultValue={card.setName ?? ""}
              />
              <Field
                name="cardNumber"
                label="Số thẻ / mã sản phẩm"
                defaultValue={card.cardNumber ?? ""}
              />
              <Field
                name="rarity"
                label="Độ hiếm"
                defaultValue={card.rarity ?? ""}
              />
              <Field
                name="characterName"
                label="Nhân vật"
                defaultValue={card.characterName ?? ""}
              />
            </div>
          </FormSection>

          <FormSection title="Tình trạng">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {conditions.map((item) => (
                <label
                  key={item.value}
                  className="relative cursor-pointer rounded-xl border border-app-border bg-panel px-1 py-3 text-center has-[:checked]:border-violet-500 has-[:checked]:bg-accent-soft has-[:checked]:text-accent-text"
                >
                  <input
                    type="radio"
                    name="condition"
                    value={item.value}
                    defaultChecked={
                      (representative?.condition ?? "NM") === item.value
                    }
                    className="sr-only"
                  />
                  <span className="block text-xs font-black">{item.code}</span>
                  <span className="mt-1 block text-[8px] leading-3">
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          </FormSection>

          <FormSection title="Thông tin sở hữu">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                name="costPrice"
                label="Giá mua (VND) *"
                type="number"
                min="0"
                defaultValue={String(representative?.costPrice ?? 0)}
                required
              />
              <Field
                name="marketPrice"
                label="Giá thị trường (VND)"
                type="number"
                min="0"
                defaultValue={
                  card.marketPrice != null ? String(card.marketPrice) : ""
                }
                placeholder="Ước giá đang giao dịch"
              />
              <Field
                name="acquiredAt"
                label="Ngày mua"
                type="date"
                defaultValue={
                  representative?.acquiredAt
                    ? representative.acquiredAt.toISOString().slice(0, 10)
                    : ""
                }
              />
              <Field
                name="storageLocation"
                label="Vị trí lưu trữ"
                defaultValue={representative?.storageLocation ?? ""}
              />
            </div>
            {!activeItems.length && (
              <p className="text-[10px] leading-4 text-amber-600">
                Card không còn mục khả dụng; thay đổi thông tin sở hữu sẽ không
                sửa các giao dịch đã hoàn tất.
              </p>
            )}
          </FormSection>

          <FormSection title="Ghi chú">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold text-muted">
                Ghi chú
              </span>
              <textarea
                name="notes"
                defaultValue={representative?.notes ?? card.notes ?? ""}
                rows={4}
                className="w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-500"
              />
            </label>
          </FormSection>

          <div className="flex gap-3 pb-4">
            <Link
              href={`/the/${card.id}`}
              className="rounded-xl border border-app-border bg-panel px-5 py-3 text-sm font-bold text-secondary"
            >
              Hủy
            </Link>
            <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-violet-950/30">
              <Save size={17} />
              Lưu thay đổi
            </button>
          </div>
        </form>
      </main>
    </AppShell>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-app-border bg-surface p-4">
      <h2 className="text-xs font-black text-primary">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold text-muted">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-500"
      />
    </label>
  );
}
