import SeatManager from "../components/SeatManager";
import AdminLayout from "../layouts/AdminLayout";

export default function SeatsPage() {
  return (
    <AdminLayout title="座席管理" backHref="/" backLabel="← 管理トップ">
      <SeatManager />
    </AdminLayout>
  );
}
