import OrderBoard from "../components/OrderBoard";
import AdminLayout from "../layouts/AdminLayout";

export default function OrdersPage() {
  return (
    <AdminLayout title="注文確認" backHref="/" backLabel="← 管理トップ">
      <OrderBoard />
    </AdminLayout>
  );
}
