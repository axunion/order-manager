import StaffManager from "../components/StaffManager";
import AdminLayout from "../layouts/AdminLayout";

export default function StaffPage() {
  return (
    <AdminLayout title="スタッフ管理" backHref="/" backLabel="← 管理トップ">
      <StaffManager />
    </AdminLayout>
  );
}
