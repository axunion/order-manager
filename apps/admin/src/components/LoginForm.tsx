import { jsonFetch } from "@order/core/client";
import { Button, Field } from "@order/ui";
import { createSignal, Show } from "solid-js";
import styles from "./LoginForm.module.css";

export default function LoginForm() {
  const [email, setEmail] = createSignal("");
  const [error, setError] = createSignal("");
  const [sent, setSent] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await jsonFetch("/api/auth/login", "POST", {
        email: email(),
      });
      if (!result.ok) {
        setError(result.message ?? "エラーが発生しました");
        return;
      }
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Show
      when={!sent()}
      fallback={
        <p class={styles.sent}>
          メールを送信しました。受信箱のリンクをクリックしてログインしてください。
        </p>
      }
    >
      <form onSubmit={handleSubmit} class={styles.form}>
        <Field
          id="login-email"
          label="メールアドレス"
          type="email"
          value={email()}
          onInput={(e) => setEmail(e.currentTarget.value)}
          placeholder="例：owner@example.com"
          required
          disabled={submitting()}
          error={error()}
        />
        <Button type="submit" fullWidth disabled={submitting()}>
          {submitting() ? "送信中..." : "ログインリンクを送信"}
        </Button>
      </form>
    </Show>
  );
}
