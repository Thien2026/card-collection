"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  Check,
  ChevronRight,
  ClipboardList,
  Package,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { BackButton } from "@/components/back-button";
import { CategoryDialog } from "@/app/bo-suu-tap/collection-create-dialog";
import { createInventoryCard } from "./actions";
import { MultiImageUpload } from "./multi-image-upload";

type Category = { id: string; name: string; parentId: string | null };
type ItemType = "SINGLE_CARD" | "SEALED_PRODUCT" | "ACCESSORY";

const cardKinds: {
  value: ItemType;
  title: string;
  description: string;
  icon: typeof Sparkles;
}[] = [
  {
    value: "SINGLE_CARD",
    title: "Card đơn",
    description: "Card rời: Pokémon, Conan, Yu-Gi-Oh!...",
    icon: Sparkles,
  },
  {
    value: "SEALED_PRODUCT",
    title: "Sản phẩm sealed",
    description: "Booster pack, booster box, display hoặc sản phẩm nguyên seal",
    icon: Package,
  },
  {
    value: "ACCESSORY",
    title: "Phụ kiện",
    description: "Binder, sleeve, playmat, deck box, coin, v.v.",
    icon: ClipboardList,
  },
];

const conditions = [
  { value: "MINT", label: "M", description: "Mới hoàn toàn" },
  { value: "NM", label: "NM", description: "Gần như mới" },
  { value: "LP", label: "LP", description: "Ít dấu sử dụng" },
  { value: "MP", label: "MP", description: "Hơi cũ" },
  { value: "HP", label: "HP", description: "Nhiều dấu sử dụng" },
  { value: "DMG", label: "DMG", description: "Hư hại" },
];

export function AddCardFlow({
  categories,
  initialCollectionId = "",
  initialSeriesId = "",
}: {
  categories: Category[];
  initialCollectionId?: string;
  initialSeriesId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<ItemType>("SINGLE_CARD");
  const [condition, setCondition] = useState("NM");
  const [gameId, setGameId] = useState(initialCollectionId);
  const [seriesId, setSeriesId] = useState(initialSeriesId);
  const games = categories.filter((category) => category.parentId === null);
  const series = categories.filter((category) => category.parentId === gameId);
  const selectedGame = games.find((game) => game.id === gameId);
  const isSingleCard = kind === "SINGLE_CARD";

  function handleCreate(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim() || "thẻ mới";
    startTransition(async () => {
      try {
        toast.loading("Đang thêm thẻ…", { id: "create-card" });
        await createInventoryCard(formData);
        toast.success(`Đã thêm “${name}”`, { id: "create-card" });
      } catch (error) {
        if (isRedirectError(error)) {
          toast.success(`Đã thêm “${name}”`, { id: "create-card" });
          throw error;
        }
        toast.error(
          error instanceof Error ? error.message : "Không thể thêm thẻ.",
          { id: "create-card" },
        );
      }
    });
  }

  return (
    <AppShell>
      <main className="mx-auto min-h-screen max-w-2xl px-4 py-5 sm:px-6 lg:py-10">
        <header className="mb-6 flex items-center justify-between">
          <BackButton
            href={
              initialSeriesId && initialCollectionId
                ? `/bo-suu-tap/${initialCollectionId}/${initialSeriesId}`
                : "/bo-suu-tap"
            }
            label="Quay lại bộ sưu tập"
          />
          <h1 className="text-sm font-black text-primary">Thêm mới</h1>
          <span className="text-[10px] font-bold text-accent-text">
            Lưu nháp
          </span>
        </header>

        <div className="mb-7">
          <div className="relative grid grid-cols-3">
            <div className="absolute left-[16.67%] right-[16.67%] top-3 h-px bg-app-border-strong" />
            <div
              className="absolute left-[16.67%] top-3 h-px bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300"
              style={{ width: step === 1 ? "0%" : "33.33%" }}
            />
            <StepItem
              number={1}
              label="Chọn danh mục"
              active={step === 1}
              done={step > 1}
            />
            <StepItem number={2} label="Thông tin" active={step === 2} />
            <StepItem number={3} label="Xác nhận" active={false} />
          </div>
        </div>

        {step === 1 ? (
          <section className="rounded-2xl border border-app-border bg-surface p-4 sm:p-5">
            <p className="text-sm font-bold text-primary">
              Chọn loại mục bạn muốn thêm
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Chọn đúng loại để theo dõi tồn kho phù hợp.
            </p>
            <div className="mt-5 grid gap-3">
              {cardKinds.map((item) => {
                const Icon = item.icon;
                const selected = kind === item.value;
                return (
                  <button
                    type="button"
                    key={item.value}
                    onClick={() => setKind(item.value)}
                    className={`flex items-center gap-4 rounded-xl border p-3 text-left transition ${selected ? "border-violet-400 bg-violet-500/10 shadow-[0_0_20px_rgba(124,91,255,0.13)]" : "border-app-border bg-panel hover:border-violet-400/35"}`}
                  >
                    <span
                      className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${selected ? "bg-violet-500/25 text-accent-text" : "bg-panel text-muted"}`}
                    >
                      <Icon size={25} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black text-primary">
                        {item.title}
                      </span>
                      <span className="mt-1 block text-[11px] leading-4 text-muted">
                        {item.description}
                      </span>
                    </span>
                    <ChevronRight
                      size={18}
                      className={selected ? "text-accent-text" : "text-muted"}
                    />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-3 text-sm font-black shadow-lg shadow-violet-950/40"
            >
              Tiếp tục <ChevronRight size={18} />
            </button>
          </section>
        ) : (
          <form action={handleCreate} className="space-y-4">
            <input type="hidden" name="itemType" value={kind} />
            <input type="hidden" name="condition" value={condition} />
            <input type="hidden" name="collectionId" value={gameId} />
            <input type="hidden" name="seriesId" value={seriesId} />
            <input type="hidden" name="game" value={selectedGame?.name ?? ""} />
            <MultiImageUpload />

            <FormPanel title="Thông tin cơ bản">
              <Input
                name="name"
                label={isSingleCard ? "Tên card *" : "Tên sản phẩm *"}
                placeholder={
                  isSingleCard
                    ? "Ví dụ: Pikachu VMAX"
                    : "Ví dụ: Booster Box Card 5"
                }
                required
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-muted">
                      Bộ sưu tập *
                    </span>
                    <CategoryDialog
                      collections={games.map(({ id, name }) => ({ id, name }))}
                      initialMode="collection"
                      lockMode
                      trigger="inline"
                      onCreated={({ id, mode }) => {
                        if (mode === "collection") {
                          setGameId(id);
                          setSeriesId("");
                        }
                        router.refresh();
                      }}
                    />
                  </div>
                  <ControlledSelect
                    hideLabel
                    label="Bộ sưu tập *"
                    value={gameId}
                    onChange={(value) => {
                      setGameId(value);
                      setSeriesId("");
                    }}
                    options={games}
                    placeholder="Chọn bộ sưu tập"
                    required
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-muted">
                      Series / Bộ *
                    </span>
                    <span
                      className={!gameId ? "pointer-events-none opacity-40" : ""}
                      title={
                        gameId
                          ? undefined
                          : "Chọn bộ sưu tập trước khi thêm series"
                      }
                    >
                      <CategoryDialog
                        collections={games.map(({ id, name }) => ({
                          id,
                          name,
                        }))}
                        initialMode="series"
                        parentId={gameId || undefined}
                        lockMode
                        trigger="inline"
                        onCreated={({ id, mode }) => {
                          if (mode === "series") setSeriesId(id);
                          router.refresh();
                        }}
                      />
                    </span>
                  </div>
                  <ControlledSelect
                    hideLabel
                    name="categoryId"
                    label="Series / Bộ *"
                    value={seriesId}
                    onChange={setSeriesId}
                    options={series}
                    placeholder={
                      gameId ? "Chọn series / bộ" : "Chọn bộ sưu tập trước"
                    }
                    disabled={!gameId}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  name="setName"
                  label="Tên set / phiên bản"
                  placeholder="Ví dụ: Scarlet & Violet"
                />
                <Input
                  name="cardNumber"
                  label={isSingleCard ? "Số thẻ" : "Mã sản phẩm"}
                  placeholder={isSingleCard ? "Ví dụ: 025/172" : "Nếu có"}
                />
              </div>
              {isSingleCard && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    name="rarity"
                    label="Độ hiếm"
                    placeholder="Ví dụ: Ultra Rare"
                  />
                  <Input
                    name="characterName"
                    label="Nhân vật"
                    placeholder="Ví dụ: Conan Edogawa"
                  />
                </div>
              )}
            </FormPanel>

            {isSingleCard ? (
              <FormPanel title="Tình trạng">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {conditions.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      onClick={() => setCondition(item.value)}
                      className={`rounded-xl border px-1 py-3 text-center transition ${condition === item.value ? "border-violet-500 bg-accent-soft text-accent-text" : "border-app-border bg-panel text-muted"}`}
                    >
                      <span className="block text-xs font-black">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-[8px] leading-3">
                        {item.description}
                      </span>
                    </button>
                  ))}
                </div>
              </FormPanel>
            ) : (
              <FormPanel title="Tình trạng sản phẩm">
                <p className="text-xs text-muted">
                  Sản phẩm được lưu là{" "}
                  <span className="font-bold text-accent-text">
                    {kind === "SEALED_PRODUCT"
                      ? "sealed / nguyên seal"
                      : "phụ kiện"}
                  </span>
                  .
                </p>
              </FormPanel>
            )}

            <FormPanel title="Giá trị & số lượng">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  name="quantity"
                  label="Số lượng *"
                  type="number"
                  min="1"
                  defaultValue="1"
                  required
                />
                <Input
                  name="costPrice"
                  label="Giá mua (VND) *"
                  type="number"
                  min="0"
                  placeholder="Nhập giá bạn đã mua"
                  required
                />
                <Input
                  name="marketPrice"
                  label="Giá thị trường (VND)"
                  type="number"
                  min="0"
                  placeholder="Ước giá đang giao dịch (tuỳ chọn)"
                />
                <Input
                  name="acquiredAt"
                  label="Ngày mua"
                  type="date"
                />
              </div>
            </FormPanel>

            <FormPanel title="Lưu trữ">
              <Input
                name="storageLocation"
                label="Vị trí lưu"
                placeholder="Ví dụ: Binder A / Trang 12"
              />
              <Textarea
                name="notes"
                label="Ghi chú"
                placeholder="Thêm ghi chú: tình trạng, nguồn gốc..."
              />
            </FormPanel>

            <div className="flex gap-3 pb-5">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-xl bg-panel px-5 py-3 text-sm font-bold text-secondary"
              >
                Quay lại
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-3 text-sm font-black shadow-lg shadow-violet-950/40 disabled:opacity-60"
              >
                {pending ? "Đang lưu…" : "Lưu vào kho"}{" "}
                {!pending && <Check size={18} />}
              </button>
            </div>
          </form>
        )}
      </main>
    </AppShell>
  );
}

function StepItem({
  number,
  label,
  active,
  done = false,
}: {
  number: number;
  label: string;
  active: boolean;
  done?: boolean;
}) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-2 text-center">
      <span
        className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-black ${active || done ? "bg-violet-600 text-white shadow-[0_0_14px_rgba(139,92,246,0.45)]" : "bg-surface-raised text-muted"}`}
      >
        {done ? <Check size={14} /> : number}
      </span>
      <span
        className={`text-[10px] font-bold ${active ? "text-accent-text" : done ? "text-secondary" : "text-muted"}`}
      >
        {label}
      </span>
    </div>
  );
}
function FormPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-app-border bg-surface p-4">
      <h2 className="mb-4 text-xs font-black text-primary">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function Input({
  label,
  ...props
}: React.ComponentProps<"input"> & { label: string }) {
  return (
    <label className="block text-[10px] font-bold text-muted">
      {label}
      <input
        {...props}
        className="mt-1.5 w-full rounded-lg border border-app-border bg-surface-raised px-3 py-2.5 text-xs text-primary outline-none placeholder:text-muted focus:border-violet-400"
      />
    </label>
  );
}
function Textarea({
  label,
  ...props
}: React.ComponentProps<"textarea"> & { label: string }) {
  return (
    <label className="block text-[10px] font-bold text-muted">
      {label}
      <textarea
        {...props}
        rows={3}
        className="mt-1.5 w-full rounded-lg border border-app-border bg-surface-raised px-3 py-2.5 text-xs text-primary outline-none placeholder:text-muted focus:border-violet-400"
      />
    </label>
  );
}
function ControlledSelect({
  label,
  options,
  placeholder,
  value,
  onChange,
  hideLabel = false,
  ...props
}: Omit<React.ComponentProps<"select">, "value" | "onChange"> & {
  label: string;
  options: Category[];
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  hideLabel?: boolean;
}) {
  return (
    <label className="block text-[10px] font-bold text-muted">
      {!hideLabel && label}
      <select
        {...props}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-lg border border-app-border bg-surface-raised px-3 py-2.5 text-xs text-primary outline-none focus:border-violet-400 ${hideLabel ? "" : "mt-1.5"}`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
