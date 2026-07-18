import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { Pagination } from "@/components/pagination";
import { formatVnd } from "@/lib/format";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ collectionId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const s = await auth();
  if (!s) redirect("/dang-nhap");
  const { collectionId } = await params,
    requestedPage = Math.max(1, Number((await searchParams).page) || 1);
  const c = await prisma.category.findFirst({
    where: { id: collectionId, userId: s.user.id, parentId: null },
    include: {
      children: {
        include: {
          cards: {
            include: {
              inventoryItems: {
                where: { userId: s.user.id, status: "AVAILABLE" },
              },
            },
          },
        },
      },
      cards: {
        include: {
          inventoryItems: { where: { userId: s.user.id, status: "AVAILABLE" } },
        },
      },
    },
  });
  if (!c) notFound();
  const direct = c.cards.flatMap((x) => x.inventoryItems),
    series = c.children.map((x) => ({
      name: x.name,
      items: x.cards.flatMap((y) => y.inventoryItems),
    })),
    all = [...direct, ...series.flatMap((x) => x.items)],
    value = all.reduce((n, x) => n + x.costPrice, 0),
    conditions = Object.entries(
      all.reduce<Record<string, number>>(
        (a, x) => ((a[x.condition] = (a[x.condition] || 0) + 1), a),
        {},
      ),
    );
  const totalPages = Math.max(1, Math.ceil(series.length / 10));
  const page = Math.min(requestedPage, totalPages);
  return (
    <AppShell isAdmin={s.user.role === "ADMIN"}>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center gap-3">
          <BackButton
            href={`/bo-suu-tap/${collectionId}`}
            label="Quay lại bộ sưu tập"
          />
          <h1 className="text-2xl font-black">Thống kê · {c.name}</h1>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Tổng số mục", all.length],
            ["Tổng giá trị", formatVnd(value)],
            ["Trung bình", formatVnd(all.length ? value / all.length : 0)],
            ["Series", series.length],
          ].map((x) => (
            <div
              className="rounded-2xl border border-app-border bg-surface p-4"
              key={x[0]}
            >
              <p className="text-xs text-muted">{x[0]}</p>
              <p className="mt-1 font-black">{x[1]}</p>
            </div>
          ))}
        </div>
        <section className="mt-6 rounded-2xl border border-app-border bg-surface p-4">
          <h2 className="font-black">Tình trạng</h2>
          {conditions.map(([k, v]) => (
            <div className="mt-3" key={k}>
              <div className="flex justify-between text-xs">
                <span>{k}</span>
                <b>{v}</b>
              </div>
              <div className="mt-1 h-2 rounded bg-panel">
                <div
                  className="h-full rounded bg-violet-500"
                  style={{
                    width: `${all.length ? (v / all.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </section>
        <section className="mt-6 overflow-hidden rounded-2xl border border-app-border bg-surface">
          <h2 className="p-4 font-black">Theo series</h2>
          {series.slice((page - 1) * 10, page * 10).map((x) => (
            <div
              className="flex justify-between border-t border-app-border p-4 text-sm"
              key={x.name}
            >
              <b>{x.name}</b>
              <span>
                {x.items.length} ·{" "}
                {formatVnd(x.items.reduce((n, i) => n + i.costPrice, 0))}
              </span>
            </div>
          ))}
          <div className="border-t border-app-border px-4 pb-4">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              basePath={`/bo-suu-tap/${collectionId}/thong-ke`}
            />
          </div>
        </section>
      </main>
    </AppShell>
  );
}
