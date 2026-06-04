import { createSignal } from "solid-js";
import Button from "../ui/Button";
import Field from "../ui/Field";
import styles from "./RegisterForm.module.css";

/**
 * Store registration form (申込み画面).
 * Submits POST /api/stores and redirects to /admin on success.
 */
export default function RegisterForm() {
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name() }),
      });

      if (!res.ok) {
        // Parse the error body separately so a non-JSON infrastructure error
        // (e.g. a Cloudflare HTML 503 page) doesn't mask the HTTP status.
        let message = "登録に失敗しました";
        try {
          const errBody = (await res.json()) as {
            error: { code: string; message: string };
          };
          message = errBody.error?.message ?? message;
        } catch {
          // non-JSON error body — keep the fallback message
        }
        setError(message);
        return;
      }

      // Cookie is already set by the Set-Cookie response header.
      window.location.href = "/admin";
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
        error={error()}
      />
      <Button type="submit" fullWidth disabled={submitting()}>
        {submitting() ? "登録中..." : "登録する"}
      </Button>
    </form>
  );
}
