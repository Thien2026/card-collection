import { AdminPlaceholderPage, adminPlaceholderMeta } from "../admin-placeholder";

export const metadata = {
  title: "Nhật ký",
};

export default function AdminNhatKyPage() {
  return <AdminPlaceholderPage {...adminPlaceholderMeta.nhatKy} />;
}
