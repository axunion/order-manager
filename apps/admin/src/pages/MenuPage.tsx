import MenuManager from "../components/MenuManager";
import OptionGroupManager from "../components/OptionGroupManager";
import AdminLayout from "../layouts/AdminLayout";

export default function MenuPage() {
  return (
    <AdminLayout title="メニュー管理" backHref="/" backLabel="← 管理トップ">
      <MenuManager />
      <OptionGroupManager />
    </AdminLayout>
  );
}
