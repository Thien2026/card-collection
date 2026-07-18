import { AdminPlaceholderPage, adminPlaceholderMeta } from "../admin-placeholder";

export const metadata = {
  title: "Thống kê",
};

export default function AdminThongKePage() {
  return <AdminPlaceholderPage {...adminPlaceholderMeta.thongKe} />;
}
