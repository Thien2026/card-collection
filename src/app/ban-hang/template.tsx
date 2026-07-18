import type { ReactNode } from "react";

/**
 * Remount on every ban-hang navigation so the segment loading UI can show
 * consistently between list / create / detail / reports.
 */
export default function BanHangTemplate({ children }: { children: ReactNode }) {
  return children;
}
