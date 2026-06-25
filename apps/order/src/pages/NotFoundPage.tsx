import styles from "./NotFoundPage.module.css";

export default function NotFoundPage() {
  return (
    <div class={styles.container}>
      <h2 class={styles.heading}>ページが見つかりません</h2>
      <p class={styles.message}>
        QR コードを再度ご確認いただくか、スタッフにお声がけください。
      </p>
    </div>
  );
}
