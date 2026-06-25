import { Card } from "@order/ui";
import styles from "./CheckEmailPage.module.css";

export default function CheckEmailPage() {
  return (
    <main class={styles.page}>
      <Card class={styles.card}>
        <h1 class={styles.heading}>メールをご確認ください</h1>
        <p class={styles.body}>
          入力いただいたメールアドレス宛に確認メールを送信しました。
          <br />
          メール内のリンクをクリックすると登録が完了し、管理画面へ移動します。
        </p>
        <p class={styles.note}>
          メールが届かない場合は迷惑メールフォルダをご確認ください。
          <br />
          再送が必要な場合はメールアドレスを再度入力して申し込みください。
        </p>
      </Card>
    </main>
  );
}
