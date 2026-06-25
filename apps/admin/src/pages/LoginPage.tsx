import { Card } from "@order/ui";
import LoginForm from "../components/LoginForm";
import styles from "./LoginPage.module.css";

export default function LoginPage() {
  return (
    <main class={styles.loginPage}>
      <Card style="width: min(400px, 100%); padding: var(--space-10) var(--space-8)">
        <h1 class={styles.title}>ログイン</h1>
        <p class={styles.subtitle}>
          登録済みのメールアドレスを入力してください。ログインリンクをお送りします。
        </p>
        <LoginForm />
      </Card>
    </main>
  );
}
