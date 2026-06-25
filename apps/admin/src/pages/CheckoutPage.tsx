import CheckoutPanel from "../components/CheckoutPanel";
import AdminLayout from "../layouts/AdminLayout";

export default function CheckoutPage() {
  return (
    <AdminLayout title="会計・レジ" backHref="/" backLabel="← 管理トップ">
      <CheckoutPanel />
    </AdminLayout>
  );
}
