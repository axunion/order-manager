import { A } from "@solidjs/router";
import AdminLayout from "../layouts/AdminLayout";
import styles from "./DashboardPage.module.css";

export default function DashboardPage() {
  return (
    <AdminLayout title="管理画面">
      <div class={styles.menu}>
        <A href="/menu" class={styles.menuLink}>
          メニュー管理
        </A>
        <A href="/seats" class={styles.menuLink}>
          座席管理・QR 発行
        </A>
        <A href="/orders" class={styles.menuLink}>
          注文確認・提供管理
        </A>
        <A href="/checkout" class={styles.menuLink}>
          会計・レジ
        </A>
        <A href="/sales" class={styles.menuLink}>
          売上履歴
        </A>
        <A href="/settings" class={styles.menuLink}>
          店舗設定
        </A>
      </div>
    </AdminLayout>
  );
}
