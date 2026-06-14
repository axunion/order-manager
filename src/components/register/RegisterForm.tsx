import { createSignal } from "solid-js";
import { jsonFetch } from "../../lib/client";
import Button from "../ui/Button";
import Field from "../ui/Field";
import styles from "./RegisterForm.module.css";

/**
 * Store registration form (申込み画面).
 * Submits POST /api/stores; on success redirects to /register/check-email.
 * No cookie is set here — the session is created when the owner clicks the
 * Magic Link email.
 */
export default function RegisterForm() {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [error, setError] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await jsonFetch("/api/stores", "POST", {
        name: name(),
        email: email(),
      });

      if (!result.ok) {
        setError(result.message ?? "登録に失敗しました");
        return;
      }

      window.location.href = "/register/check-email";
    } catch {
      setError("通信エラーが発生しました。再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} class={styles.form}>
      <Field
        id="store-name"
        label="店舗名"
        value={name()}
        onInput={(e) => setName(e.currentTarget.value)}
        placeholder="例：山田珈琲店"
        required
        maxLength={100}
        disabled={submitting()}
      />
      <Field
        id="store-email"
        label="メールアドレス"
        type="email"
        value={email()}
        onInput={(e) => setEmail(e.currentTarget.value)}
        placeholder="例：owner@example.com"
        required
        disabled={submitting()}
      />
      {error() && (
        <p class={styles.formError} role="alert">
          {error()}
        </p>
      )}
      <Button type="submit" fullWidth disabled={submitting()}>
        {submitting() ? "送信中..." : "申し込む"}
      </Button>
    </form>
  );
}
