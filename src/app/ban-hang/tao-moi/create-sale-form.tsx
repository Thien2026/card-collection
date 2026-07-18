"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CreditCard,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatVnd, formatVndInput, parseVndInput } from "@/lib/format";
import { salesChannels } from "@/lib/sales-channels";
import { useMarkNavigationPending } from "@/components/navigation-pending";
import { createCustomer } from "../khach-hang/actions";
import { createSale } from "../actions";

type StockItem = {
  id: string;
  sku: string;
  costPrice: number;
  condition: string;
  imageUrl: string | null;
  card: {
    id: string;
    name: string;
    referenceImage: string | null;
    category: { name: string; parent: { name: string } | null } | null;
  };
};

type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type StockGroup = {
  key: string;
  card: StockItem["card"];
  condition: string;
  costPrice: number;
  imageUrl: string | null;
  units: StockItem[];
};

export function CreateSaleForm({
  items,
  preselectedItemId,
  initialCustomers,
  stockQuery = "",
  stockPage = 1,
  stockTotalPages = 1,
  stockTotal,
}: {
  items: StockItem[];
  preselectedItemId?: string;
  initialCustomers: CustomerOption[];
  stockQuery?: string;
  stockPage?: number;
  stockTotalPages?: number;
  stockTotal?: number;
}) {
  const router = useRouter();
  const markNavigationPending = useMarkNavigationPending();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2>(1);
  const [paidAmount, setPaidAmount] = useState(0);
  const [query, setQuery] = useState(stockQuery);
  const [customers, setCustomers] = useState(initialCustomers);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [selected, setSelected] = useState<Record<string, number>>(() => {
    if (!preselectedItemId) return {};
    const item = items.find((row) => row.id === preselectedItemId);
    return item ? { [item.id]: Math.max(item.costPrice, 0) } : {};
  });
  const [selectedCosts, setSelectedCosts] = useState<Record<string, number>>(
    () => {
      if (!preselectedItemId) return {};
      const item = items.find((row) => row.id === preselectedItemId);
      return item ? { [item.id]: item.costPrice } : {};
    },
  );

  const groups = useMemo(() => {
    const map = new Map<string, StockGroup>();
    for (const item of items) {
      const key = `${item.card.id}::${item.condition}::${item.costPrice}`;
      const existing = map.get(key);
      if (existing) {
        existing.units.push(item);
      } else {
        map.set(key, {
          key,
          card: item.card,
          condition: item.condition,
          costPrice: item.costPrice,
          imageUrl: item.imageUrl ?? item.card.referenceImage,
          units: [item],
        });
      }
    }
    return [...map.values()];
  }, [items]);

  const filtered = groups;
  const filteredCustomers = useMemo(() => {
    const value = customerQuery.trim().toLowerCase();
    if (!value) return customers.slice(0, 6);
    return customers
      .filter((customer) =>
        [customer.name, customer.phone, customer.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(value),
      )
      .slice(0, 8);
  }, [customers, customerQuery]);
  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId,
  );

  const selectedIds = Object.keys(selected);
  const revenue = selectedIds.reduce((sum, id) => sum + (selected[id] ?? 0), 0);
  const capital = selectedIds.reduce(
    (sum, id) => sum + (selectedCosts[id] ?? 0),
    0,
  );

  function toggleGroup(group: StockGroup) {
    setSelected((current) => {
      const activeUnits = group.units.filter(
        (item) => current[item.id] !== undefined,
      );
      const next = { ...current };
      if (activeUnits.length) {
        for (const item of group.units) delete next[item.id];
      } else {
        const first = group.units[0];
        if (first) next[first.id] = group.costPrice;
      }
      setSelectedCosts((costs) => {
        const nextCosts = { ...costs };
        if (activeUnits.length) {
          for (const item of group.units) delete nextCosts[item.id];
        } else {
          const first = group.units[0];
          if (first) nextCosts[first.id] = group.costPrice;
        }
        return nextCosts;
      });
      return next;
    });
  }

  function setGroupQuantity(group: StockGroup, quantity: number) {
    const safeQuantity = Math.max(
      1,
      Math.min(group.units.length, Math.floor(quantity) || 1),
    );
    setSelected((current) => {
      const next = { ...current };
      const currentPrice =
        group.units
          .map((item) => current[item.id])
          .find((price) => price !== undefined) ?? group.costPrice;
      for (const item of group.units) delete next[item.id];
      for (const item of group.units.slice(0, safeQuantity)) {
        next[item.id] = currentPrice;
      }
      return next;
    });
    setSelectedCosts((current) => {
      const next = { ...current };
      for (const item of group.units) delete next[item.id];
      for (const item of group.units.slice(0, safeQuantity)) {
        next[item.id] = group.costPrice;
      }
      return next;
    });
  }

  function setGroupPrice(group: StockGroup, price: number) {
    setSelected((current) => {
      const next = { ...current };
      for (const item of group.units) {
        if (next[item.id] !== undefined) next[item.id] = price;
      }
      return next;
    });
  }

  async function quickCreateCustomer() {
    const form = document.getElementById(
      "create-sale-form",
    ) as HTMLFormElement;
    const source = new FormData(form);
    const formData = new FormData();
    formData.set("name", String(source.get("quickCustomerName") ?? ""));
    formData.set("phone", String(source.get("quickCustomerPhone") ?? ""));
    formData.set("email", String(source.get("quickCustomerEmail") ?? ""));
    setCreatingCustomer(true);
    try {
      const customer = await createCustomer(formData);
      setCustomers((current) => [customer, ...current]);
      setCustomerId(customer.id);
      setCustomerQuery("");
      setQuickCustomerOpen(false);
      toast.success(`Đã tạo và chọn “${customer.name}”`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Không thể tạo khách hàng.",
      );
    } finally {
      setCreatingCustomer(false);
    }
  }

  function submit(finalize: boolean) {
    if (!selectedIds.length) {
      toast.error("Chọn ít nhất một mục để bán.");
      return;
    }
    const form = document.getElementById("create-sale-form") as HTMLFormElement;
    const data = new FormData(form);
    data.set("finalize", finalize ? "1" : "0");
    if (finalize) data.set("paidAmount", String(paidAmount));
    if (customerId) data.set("customerId", customerId);
    for (const id of selectedIds) {
      data.append("itemId", id);
      data.set(`soldPrice_${id}`, String(selected[id] ?? 0));
    }
    startTransition(async () => {
      try {
        toast.loading(finalize ? "Đang hoàn tất bán…" : "Đang lưu nháp…", {
          id: "create-sale",
        });
        await createSale(data);
        toast.success(finalize ? "Đã bán thành công" : "Đã lưu đơn nháp", {
          id: "create-sale",
        });
      } catch (error) {
        if (isRedirectError(error)) {
          toast.success(finalize ? "Đã bán thành công" : "Đã lưu đơn nháp", {
            id: "create-sale",
          });
          throw error;
        }
        toast.error(
          error instanceof Error ? error.message : "Không thể tạo giao dịch.",
          { id: "create-sale" },
        );
      }
    });
  }

  return (
    <form
      id="create-sale-form"
      className="space-y-4"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-app-border bg-surface p-1">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`rounded-lg px-3 py-2.5 text-[10px] font-black ${
            step === 1 ? "bg-accent text-white" : "text-muted"
          }`}
        >
          1. Chọn sản phẩm
        </button>
        <button
          type="button"
          onClick={() => {
            if (!selectedIds.length) {
              toast.error("Chọn ít nhất một mục để tiếp tục.");
              return;
            }
            setPaidAmount(revenue);
            setStep(2);
          }}
          className={`rounded-lg px-3 py-2.5 text-[10px] font-black ${
            step === 2 ? "bg-accent text-white" : "text-muted"
          }`}
        >
          2. Thanh toán
        </button>
      </div>

      <div className={step === 1 ? "space-y-4" : "hidden"}>
      <section className="rounded-2xl border border-app-border bg-surface p-4">
        <h2 className="text-sm font-black text-primary">Thông tin đơn</h2>
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-muted">
              Khách hàng
            </span>
            <button
              type="button"
              onClick={() => setQuickCustomerOpen((value) => !value)}
              className="inline-flex items-center gap-1 text-[10px] font-black text-accent-text"
            >
              {quickCustomerOpen ? <X size={12} /> : <Plus size={12} />}
              {quickCustomerOpen ? "Đóng" : "Tạo nhanh"}
            </button>
          </div>

          {selectedCustomer ? (
            <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-violet-400/40 bg-accent-soft p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500 text-white">
                <UserRound size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-primary">
                  {selectedCustomer.name}
                </p>
                <p className="mt-0.5 truncate text-[9px] text-muted">
                  {[selectedCustomer.phone, selectedCustomer.email]
                    .filter(Boolean)
                    .join(" · ") || "Chưa có thông tin liên hệ"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomerId("")}
                aria-label="Bỏ chọn khách hàng"
                className="grid h-8 w-8 place-items-center rounded-lg bg-surface text-muted"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="relative mt-1.5">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  value={customerQuery}
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  placeholder="Tìm tên, số điện thoại, email..."
                  className="w-full rounded-xl border border-app-border bg-panel py-2.5 pl-9 pr-3 text-xs text-primary outline-none focus:border-violet-400"
                />
              </div>
              {filteredCustomers.length > 0 && (
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => {
                        setCustomerId(customer.id);
                        setCustomerQuery("");
                      }}
                      className="flex items-center gap-2 rounded-xl border border-app-border bg-panel p-2.5 text-left transition hover:border-violet-400/50"
                    >
                      <UserRound
                        size={15}
                        className="shrink-0 text-accent-text"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[10px] font-black text-primary">
                          {customer.name}
                        </span>
                        <span className="block truncate text-[8px] text-muted">
                          {customer.phone || customer.email || "Khách hàng"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <label className="mt-2 block">
                <span className="text-[9px] text-muted">
                  Hoặc bán cho khách lẻ
                </span>
                <input
                  name="customerName"
                  placeholder="Nhập tên khách (không lưu)"
                  className="mt-1 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-xs text-primary outline-none focus:border-violet-400"
                />
              </label>
            </>
          )}

          {quickCustomerOpen && (
            <div className="mt-3 rounded-xl border border-violet-400/30 bg-accent-soft p-3">
              <p className="text-xs font-black text-primary">
                Tạo khách hàng nhanh
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <input
                  name="quickCustomerName"
                  placeholder="Tên khách *"
                  className="rounded-lg border border-app-border bg-surface px-3 py-2 text-xs text-primary outline-none"
                />
                <input
                  name="quickCustomerPhone"
                  placeholder="Số điện thoại"
                  className="rounded-lg border border-app-border bg-surface px-3 py-2 text-xs text-primary outline-none"
                />
                <input
                  name="quickCustomerEmail"
                  type="email"
                  placeholder="Email"
                  className="rounded-lg border border-app-border bg-surface px-3 py-2 text-xs text-primary outline-none"
                />
              </div>
              <button
                type="button"
                disabled={creatingCustomer}
                onClick={() => void quickCreateCustomer()}
                className="mt-2 rounded-lg bg-accent px-3 py-2 text-[10px] font-black text-white disabled:opacity-50"
              >
                {creatingCustomer ? "Đang tạo…" : "Tạo và chọn khách"}
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] font-bold text-muted">Kênh bán</span>
            <select
              name="salesChannel"
              defaultValue=""
              className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
            >
              <option value="">Chọn kênh bán</option>
              {salesChannels.map((channel) => (
                <option key={channel.value} value={channel.value}>
                  {channel.label}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Chi phí phát sinh (₫)"
            name="expenseAmount"
            placeholder="0"
            type="number"
          />
        </div>
        <label className="mt-3 block">
          <span className="text-[10px] font-bold text-muted">Ghi chú</span>
          <textarea
            name="notes"
            rows={2}
            placeholder="Ghi chú nội bộ..."
            className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
          />
        </label>
        <div className="mt-3">
          <Field
            label="Mô tả chi phí"
            name="expenseLabel"
            placeholder="Ship / phí sàn / đóng gói..."
          />
        </div>
      </section>

      <section className="rounded-2xl border border-app-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-primary">Chọn mục trong kho</h2>
            <p className="mt-1 text-[10px] text-muted">
              Đã chọn {selectedIds.length} mục · Doanh thu dự kiến {formatVnd(revenue)}
              {typeof stockTotal === "number"
                ? ` · Kho ${stockTotal} mục`
                : ""}
              {stockTotalPages > 1 ? ` · Trang ${stockPage}/${stockTotalPages}` : ""}
            </p>
          </div>
          <form
            className="relative w-full sm:max-w-xs"
            onSubmit={(event) => {
              event.preventDefault();
              const params = new URLSearchParams();
              const value = query.trim();
              if (value) params.set("q", value);
              const suffix = params.toString();
              markNavigationPending();
              router.push(
                suffix ? `/ban-hang/tao-moi?${suffix}` : "/ban-hang/tao-moi",
              );
            }}
          >
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm thẻ, SKU, series..."
              className="w-full rounded-xl border border-app-border bg-panel py-2.5 pl-9 pr-3 text-xs text-primary outline-none focus:border-violet-400"
            />
          </form>
        </div>

        <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-app-border p-6 text-center text-xs text-muted">
              Không còn mục sẵn sàng để bán.
            </p>
          ) : (
            filtered.map((group) => {
              const selectedUnits = group.units.filter(
                (item) => selected[item.id] !== undefined,
              );
              const active = selectedUnits.length > 0;
              const unitPrice = active
                ? (selected[selectedUnits[0]!.id] ?? group.costPrice)
                : group.costPrice;
              return (
                <div
                  key={group.key}
                  className={`rounded-xl border p-3 transition ${
                    active
                      ? "border-violet-400/60 bg-accent-soft"
                      : "border-app-border bg-panel"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                        active
                          ? "border-violet-500 bg-violet-500 text-white"
                          : "border-app-border bg-surface"
                      }`}
                      aria-label={active ? "Bỏ chọn" : "Chọn"}
                    >
                      {active && <Check size={12} strokeWidth={3} />}
                    </button>
                    <div className="grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface">
                      {group.imageUrl ? (
                        <img
                          src={group.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[9px] text-muted">N/A</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-xs font-black text-primary">
                          {group.card.name}
                        </p>
                        <span className="shrink-0 rounded-full bg-violet-500/12 px-2 py-1 text-[8px] font-black text-accent-text">
                          Có {group.units.length} tấm
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted">
                        {[
                          group.card.category?.parent?.name,
                          group.card.category?.name,
                          group.condition,
                          `vốn ${formatVnd(group.costPrice)}/tấm`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {active && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <label>
                            <span className="text-[9px] font-bold text-muted">
                              Số lượng
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={group.units.length}
                              value={selectedUnits.length}
                              onChange={(event) =>
                                setGroupQuantity(
                                  group,
                                  Number(event.target.value),
                                )
                              }
                              className="mt-1 w-full rounded-lg border border-app-border bg-surface px-2 py-2 text-sm font-bold text-primary outline-none focus:border-violet-400"
                            />
                          </label>
                          <label>
                            <span className="text-[9px] font-bold text-muted">
                              Giá / tấm
                            </span>
                            <MoneyInput
                              value={unitPrice}
                              onValueChange={(price) =>
                                setGroupPrice(group, price)
                              }
                              className="mt-1 w-full rounded-lg border border-app-border bg-surface px-2 py-2 text-sm font-bold text-primary outline-none focus:border-violet-400"
                            />
                          </label>
                          <label>
                            <span className="text-[9px] font-bold text-muted">
                              Giá tổng
                            </span>
                            <MoneyInput
                              value={unitPrice * selectedUnits.length}
                              onValueChange={(total) => {
                                const quantity = selectedUnits.length || 1;
                                setGroupPrice(
                                  group,
                                  Math.round(total / quantity),
                                );
                              }}
                              className="mt-1 w-full rounded-lg border border-app-border bg-surface px-2 py-2 text-sm font-bold text-primary outline-none focus:border-violet-400"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
      </div>

      {step === 2 && (
        <section className="rounded-2xl border border-app-border bg-surface p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-accent-text">
                Thanh toán
              </p>
              <h2 className="mt-1 text-lg font-black text-primary">
                Xác nhận đơn hàng
              </h2>
              <p className="mt-1 text-[10px] text-muted">
                {selectedIds.length} mục
                {selectedCustomer
                  ? ` · ${selectedCustomer.name}`
                  : " · Khách lẻ"}
              </p>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
              <CreditCard size={20} />
            </span>
          </div>

          <div className="mt-5 rounded-2xl border border-app-border bg-panel p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Tổng tiền hàng</span>
              <span className="font-black text-primary">
                {formatVnd(revenue)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted">Chi phí đơn</span>
              <span className="font-bold text-secondary">
                Không tính vào tiền khách trả
              </span>
            </div>
            <div className="mt-3 border-t border-app-border pt-3">
              <p className="text-[10px] text-muted">Cần thanh toán</p>
              <p className="mt-1 text-2xl font-black text-primary">
                {formatVnd(revenue)}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-[10px] font-bold text-muted">
                Khách thanh toán (₫)
              </span>
              <MoneyInput
                value={paidAmount}
                onValueChange={setPaidAmount}
                className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-3 text-base font-black text-primary outline-none focus:border-violet-400"
              />
            </label>
            <label>
              <span className="text-[10px] font-bold text-muted">
                Phương thức thanh toán
              </span>
              <select
                name="paymentMethod"
                defaultValue="BANK_TRANSFER"
                className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-3 text-sm text-primary outline-none focus:border-violet-400"
              >
                <option value="BANK_TRANSFER">Chuyển khoản</option>
                <option value="CASH">Tiền mặt</option>
                <option value="EWALLET">Ví điện tử</option>
                <option value="OTHER">Khác</option>
              </select>
            </label>
          </div>

          <div
            className={`mt-4 rounded-xl border p-3 ${
              revenue - paidAmount > 0
                ? "border-amber-500/25 bg-amber-500/10"
                : revenue - paidAmount < 0
                  ? "border-sky-500/25 bg-sky-500/10"
                  : "border-emerald-500/25 bg-emerald-500/10"
            }`}
          >
            <p className="text-[10px] font-bold text-muted">
              Kết quả sau thanh toán
            </p>
            <p
              className={`mt-1 text-sm font-black ${
                revenue - paidAmount > 0
                  ? "text-amber-600"
                  : revenue - paidAmount < 0
                    ? "text-sky-600"
                    : "text-emerald-600"
              }`}
            >
              {revenue - paidAmount > 0
                ? `Khách nợ mình ${formatVnd(revenue - paidAmount)}`
                : revenue - paidAmount < 0
                  ? `Mình nợ khách ${formatVnd(paidAmount - revenue)}`
                  : "Đã thanh toán đủ"}
            </p>
            {!customerId && paidAmount !== revenue && (
              <p className="mt-1 text-[9px] font-bold text-rose-500">
                Cần chọn khách hàng để lưu phần công nợ này.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="sticky bottom-20 z-20 rounded-2xl border border-app-border bg-surface/95 p-4 shadow-xl backdrop-blur lg:bottom-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] text-muted">
              Vốn {formatVnd(capital)} · Lãi tạm tính {formatVnd(revenue - capital)}
            </p>
            <p className="mt-1 text-lg font-black text-primary">
              {formatVnd(revenue)}
            </p>
          </div>
          <div className="flex gap-2">
            {step === 1 ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => submit(false)}
                  className="rounded-xl border border-app-border bg-panel px-4 py-3 text-xs font-black text-secondary disabled:opacity-50"
                >
                  Lưu nháp
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!selectedIds.length) {
                      toast.error("Chọn ít nhất một mục để tiếp tục.");
                      return;
                    }
                    setPaidAmount(revenue);
                    setStep(2);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-3 text-xs font-black text-white shadow-lg shadow-violet-950/20 disabled:opacity-50"
                >
                  Thanh toán
                  <ChevronRight size={15} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-app-border bg-panel px-4 py-3 text-xs font-black text-secondary disabled:opacity-50"
                >
                  <ArrowLeft size={14} />
                  Quay lại
                </button>
                <button
                  type="button"
                  disabled={pending || (!customerId && paidAmount !== revenue)}
                  onClick={() => submit(true)}
                  className="rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-3 text-xs font-black text-white shadow-lg shadow-rose-950/20 disabled:opacity-50"
                >
                  Xác nhận bán
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </form>
  );
}

function Field({
  label,
  name,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-muted">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
      />
    </label>
  );
}

function MoneyInput({
  value,
  onValueChange,
  className,
}: {
  value: number;
  onValueChange: (value: number) => void;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(formatVndInput(value));

  return (
    <input
      inputMode="numeric"
      value={focused ? draft : formatVndInput(value)}
      onFocus={() => {
        setFocused(true);
        setDraft(value > 0 ? formatVndInput(value) : "");
      }}
      onChange={(event) => {
        setDraft(event.target.value.replace(/[^\d.]/g, ""));
      }}
      onBlur={() => {
        const parsed = parseVndInput(draft);
        onValueChange(parsed);
        setDraft(formatVndInput(parsed));
        setFocused(false);
      }}
      className={className}
    />
  );
}
