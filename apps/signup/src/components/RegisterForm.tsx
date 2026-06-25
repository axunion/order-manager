import { jsonFetch } from "@order/core/client";
import { Button, Field } from "@order/ui";
import { createSignal } from "solid-js";
import styles from "./RegisterForm.module.css";

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
      window.location.href = "/check-email";
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
