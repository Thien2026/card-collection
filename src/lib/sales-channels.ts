export const salesChannels = [
  { value: "FACEBOOK", label: "Facebook" },
  { value: "SHOPEE", label: "Shopee" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "OFFLINE", label: "Offline / gặp mặt" },
  { value: "OTHER", label: "Khác" },
] as const;

export type SalesChannel = (typeof salesChannels)[number]["value"];

const channelLabels = new Map<string, string>(
  salesChannels.map((channel) => [channel.value, channel.label]),
);
const legacyAliases: Record<string, string> = {
  facebook: "Facebook",
  fb: "Facebook",
  shopee: "Shopee",
  tiktok: "TikTok",
  tiktokshop: "TikTok",
  offline: "Offline / gặp mặt",
  gapmat: "Offline / gặp mặt",
  truciep: "Offline / gặp mặt",
};

export function isSalesChannel(value: string): value is SalesChannel {
  return channelLabels.has(value);
}

export function salesChannelLabel(value: string | null) {
  if (!value) return "Không xác định";
  const fixedLabel = channelLabels.get(value);
  if (fixedLabel) return fixedLabel;
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return legacyAliases[normalized] ?? "Khác";
}
