export function formatVnd(amount: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** 20000 -> "20.000" */
export function formatVndInput(amount: number) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.floor(amount) || 0));
}

/** "20.000" / "20000" / "20,000" -> 20000 */
export function parseVndInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return 0;
  return Number(digits);
}
