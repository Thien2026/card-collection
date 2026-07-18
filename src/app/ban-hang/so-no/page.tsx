import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, BookMarked, Search } from "lucide-react";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { Pagination } from "@/components/pagination";
import { formatVnd } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 12;
const filters = ["ALL", "RECEIVABLE", "PAYABLE"] as const;
type DebtFilter = (typeof filters)[number];

type BalanceRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  balance: number;
  orderCount: number;
};

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; type?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/dang-nhap");
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const type: DebtFilter = filters.includes(params.type as DebtFilter)
    ? (params.type as DebtFilter)
    : "ALL";
  const requestedPage = positiveInt(params.page);

  const queryFilter = query
    ? Prisma.sql`AND (
        c.name ILIKE ${`%${query}%`}
        OR COALESCE(c.phone, '') ILIKE ${`%${query}%`}
        OR COALESCE(c.email, '') ILIKE ${`%${query}%`}
      )`
    : Prisma.empty;
  const typeFilter =
    type === "RECEIVABLE"
      ? Prisma.sql`AND balance > 0`
      : type === "PAYABLE"
        ? Prisma.sql`AND balance < 0`
        : Prisma.sql`AND balance <> 0`;

  type CountRow = { count: number };
  type SummaryRow = { receivable: number; payable: number; customerCount: number };

  const [countRows, summaryRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      WITH balances AS (${balanceQuery(session.user.id)})
      SELECT COUNT(*)::int AS count
      FROM balances c
      WHERE TRUE ${queryFilter} ${typeFilter}
    `),
    prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
      WITH balances AS (${balanceQuery(session.user.id)})
      SELECT
        COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0)::int AS receivable,
        COALESCE(SUM(CASE WHEN balance < 0 THEN -balance ELSE 0 END), 0)::int AS payable,
        COUNT(*) FILTER (WHERE balance <> 0)::int AS "customerCount"
      FROM balances
    `),
  ]);

  const totalRows = countRows[0]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const rows = await prisma.$queryRaw<BalanceRow[]>(Prisma.sql`
    WITH balances AS (${balanceQuery(session.user.id)})
    SELECT id, name, phone, email, balance, "orderCount"
    FROM balances c
    WHERE TRUE ${queryFilter} ${typeFilter}
    ORDER BY ABS(balance) DESC, name ASC
    LIMIT ${PAGE_SIZE}
    OFFSET ${(currentPage - 1) * PAGE_SIZE}
  `);
  const summary = summaryRows[0] ?? {
    receivable: 0,
    payable: 0,
    customerCount: 0,
  };

  return (
    <AppShell isAdmin={session.user.role === "ADMIN"}>
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-5 sm:px-6 lg:py-10">
        <BackButton href="/ban-hang" label="Quay lại giao dịch" />
        <header className="mt-6 flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-text">
            <BookMarked size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-black text-primary">Sổ nợ</h1>
            <p className="mt-1 text-xs text-muted">
              Theo dõi các khoản khách nợ mình và mình nợ khách.
            </p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-3 gap-2">
          <SummaryCard
            label="Khách nợ mình"
            value={formatVnd(summary.receivable)}
            tone="amber"
          />
          <SummaryCard
            label="Mình nợ khách"
            value={formatVnd(summary.payable)}
            tone="sky"
          />
          <SummaryCard
            label="Khách có nợ"
            value={String(summary.customerCount)}
            tone="violet"
          />
        </section>

        <section className="mt-5">
          <form className="relative">
            {type !== "ALL" && (
              <input type="hidden" name="type" value={type} />
            )}
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              name="q"
              defaultValue={query}
              placeholder="Tìm tên, số điện thoại, email..."
              className="w-full rounded-xl border border-app-border bg-surface py-3 pl-9 pr-3 text-xs text-primary outline-none focus:border-violet-400"
            />
          </form>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {filters.map((value) => (
              <Link
                key={value}
                href={filterHref(value, query)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-[10px] font-black ${
                  type === value
                    ? "bg-accent text-white"
                    : "border border-app-border bg-surface text-secondary"
                }`}
              >
                {
                  {
                    ALL: "Tất cả công nợ",
                    RECEIVABLE: "Khách nợ mình",
                    PAYABLE: "Mình nợ khách",
                  }[value]
                }
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-4 space-y-2">
          {rows.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-app-border-strong bg-surface p-10 text-center">
              <BookMarked size={25} className="mx-auto text-accent-text" />
              <h2 className="mt-3 text-sm font-black text-primary">
                Không có công nợ
              </h2>
              <p className="mt-1 text-xs text-muted">
                Các khoản thanh toán thiếu hoặc thừa sẽ xuất hiện ở đây.
              </p>
            </div>
          ) : (
            rows.map((row) => (
              <Link
                key={row.id}
                href={`/ban-hang/khach-hang/${row.id}`}
                className="flex items-center gap-3 rounded-2xl border border-app-border bg-surface p-4 transition hover:border-violet-400/50"
              >
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                    row.balance > 0
                      ? "bg-amber-500/12 text-amber-600"
                      : "bg-sky-500/12 text-sky-600"
                  }`}
                >
                  {row.balance > 0 ? (
                    <ArrowUpRight size={19} />
                  ) : (
                    <ArrowDownLeft size={19} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-primary">
                    {row.name}
                  </p>
                  <p className="mt-0.5 truncate text-[9px] text-muted">
                    {[row.phone, row.email, `${row.orderCount} đơn`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-black ${
                      row.balance > 0 ? "text-amber-600" : "text-sky-600"
                    }`}
                  >
                    {formatVnd(Math.abs(row.balance))}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted">
                    {row.balance > 0 ? "Khách nợ mình" : "Mình nợ khách"}
                  </p>
                </div>
              </Link>
            ))
          )}
        </section>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath="/ban-hang/so-no"
          params={{
            q: query || undefined,
            type: type === "ALL" ? undefined : type,
          }}
        />
      </main>
    </AppShell>
  );
}

function balanceQuery(userId: string) {
  return Prisma.sql`
    SELECT
      c.id,
      c.name,
      c.phone,
      c.email,
      (
        COALESCE(s."purchaseTotal", 0)
        + COALESCE(p."paidByUs", 0)
        - COALESCE(p."paidToUs", 0)
      )::int AS balance,
      COALESCE(s."orderCount", 0)::int AS "orderCount"
    FROM "Customer" c
    LEFT JOIN (
      SELECT
        s."customerId",
        COALESCE(SUM(si."soldPrice"), 0)::int AS "purchaseTotal",
        COUNT(DISTINCT s.id)::int AS "orderCount"
      FROM "Sale" s
      LEFT JOIN "SaleItem" si ON si."saleId" = s.id
      WHERE s.status IN ('COMPLETED', 'REFUNDED')
        AND s."createdById" = ${userId}
        AND si."refundedAt" IS NULL
      GROUP BY s."customerId"
    ) s ON s."customerId" = c.id
    LEFT JOIN (
      SELECT
        p."customerId",
        COALESCE(SUM(CASE WHEN p.direction = 'CUSTOMER_TO_US' THEN p.amount ELSE 0 END), 0)::int AS "paidToUs",
        COALESCE(SUM(CASE WHEN p.direction = 'US_TO_CUSTOMER' THEN p.amount ELSE 0 END), 0)::int AS "paidByUs"
      FROM "CustomerPayment" p
      GROUP BY p."customerId"
    ) p ON p."customerId" = c.id
    WHERE c."userId" = ${userId}
  `;
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "amber" | "sky" | "violet";
}) {
  const tones = {
    amber: "text-amber-600",
    sky: "text-sky-600",
    violet: "text-accent-text",
  };
  return (
    <div className="min-w-0 rounded-2xl border border-app-border bg-surface p-3 sm:p-4">
      <p className="truncate text-[9px] text-muted">{label}</p>
      <p className={`mt-1 truncate text-sm font-black ${tones[tone]}`}>
        {value}
      </p>
    </div>
  );
}

function positiveInt(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function filterHref(type: DebtFilter, query: string) {
  const params = new URLSearchParams();
  if (type !== "ALL") params.set("type", type);
  if (query) params.set("q", query);
  const suffix = params.toString();
  return suffix ? `/ban-hang/so-no?${suffix}` : "/ban-hang/so-no";
}
