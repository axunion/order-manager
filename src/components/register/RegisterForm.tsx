import { createSignal } from "solid-js";

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

      const body = (await res.json()) as
        | { data: { id: string; name: string; slug: string } }
        | { error: { code: string; message: string } };

      if (!res.ok) {
        const errBody = body as { error: { code: string; message: string } };
        setError(errBody.error?.message ?? "登録に失敗しました");
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
    <form onSubmit={handleSubmit} class="register-form">
      <div class="field">
        <label for="store-name">店舗名</label>
        <input
          id="store-name"
          type="text"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          placeholder="例：山田珈琲店"
          required
          maxLength={100}
          disabled={submitting()}
        />
      </div>

      {error() && (
        <p class="error" role="alert">
          {error()}
        </p>
      )}

      <button type="submit" disabled={submitting()}>
        {submitting() ? "登録中..." : "登録する"}
      </button>
    </form>
  );
}
