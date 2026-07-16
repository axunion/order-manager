import StoreSettings from "../components/StoreSettings";
import AdminLayout from "../layouts/AdminLayout";

export default function SettingsPage() {
  return (
    <AdminLayout title="店舗設定" backHref="/" backLabel="← 管理トップ">
      <StoreSettings />
    </AdminLayout>
  );
}
