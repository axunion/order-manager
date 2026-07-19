import type { EmailChangeResponse, StoreResponse } from "@order/core";
import { apiFetch, jsonFetch } from "@order/core/client";
import { Button, Field } from "@order/ui";
import { createSignal, Show } from "solid-js";
import { useStoreInfo } from "../layouts/AdminGuard";
import styles from "./StoreSettings.module.css";

export default function StoreSettings() {
  const store = useStoreInfo();

  const [name, setName] = createSignal(store.name);
  const [nameError, setNameError] = createSignal("");
  const [nameSaving, setNameSaving] = createSignal(false);
  const [nameSaved, setNameSaved] = createSignal(false);

  const handleNameSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setNameError("");
    setNameSaved(false);
    setNameSaving(true);
    try {
      const result = await jsonFetch<StoreResponse>("/api/stores/me", "PATCH", {
        name: name(),
      });
      if (!result.ok || !result.data) {
        setNameError(result.message ?? "保存に失敗しました。");
        return;
      }
      setName(result.data.name);
      setNameSaved(true);
    } finally {
      setNameSaving(false);
    }
  };

  const [loggingOutAll, setLoggingOutAll] = createSignal(false);

  const handleLogoutAll = async () => {
    setLoggingOutAll(true);
    try {
      await apiFetch("/api/auth/logout-all", { method: "POST" }).catch(
        () => {},
      );
      // Full reload (not solid-router navigate): the server just cleared
      // every session cookie for this member, so the app must re-bootstrap
      // from scratch rather than continue with stale in-memory state.
      window.location.href = "/login";
    } finally {
      setLoggingOutAll(false);
    }
  };

  const [newEmail, setNewEmail] = createSignal("");
  const [emailError, setEmailError] = createSignal("");
  const [emailSubmitting, setEmailSubmitting] = createSignal(false);
  const [emailSent, setEmailSent] = createSignal(false);
  const [verifyUrl, setVerifyUrl] = createSignal<string | undefined>(undefined);

  const handleEmailSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setEmailError("");
    setEmailSubmitting(true);
    try {
      const result = await jsonFetch<EmailChangeResponse>(
        "/api/stores/me/email-change",
        "POST",
        { new_email: newEmail() },
      );
      if (!result.ok) {
        setEmailError(result.message ?? "変更のリクエストに失敗しました。");
        return;
      }
      setVerifyUrl(result.data?.verify_url);
      setEmailSent(true);
    } finally {
      setEmailSubmitting(false);
    }
  };

  return (
    <div class={styles.storeSettings}>
      <section class={styles.section}>
        <h2 class={styles.heading}>店舗名</h2>
        <form onSubmit={handleNameSubmit} class={styles.form}>
          <Field
            id="settings-store-name"
            label="店舗名"
            value={name()}
            onInput={(e) => {
              setName(e.currentTarget.value);
              setNameSaved(false);
            }}
            required
            maxLength={100}
            disabled={nameSaving()}
            error={nameError()}
          />
          <Button type="submit" disabled={nameSaving()}>
            {nameSaving() ? "保存中..." : "保存"}
          </Button>
          <Show when={nameSaved()}>
            <p class={styles.savedNote}>保存しました。</p>
          </Show>
        </form>
      </section>

      <section class={styles.section}>
        <h2 class={styles.heading}>自分のメールアドレス</h2>
        <p class={styles.currentEmail}>
          現在のログイン用メールアドレス: <strong>{store.email}</strong>
        </p>

        <Show
          when={!emailSent()}
          fallback={
            <>
              <p class={styles.sent}>
                新しいメールアドレス宛に確認メールを送信しました。メール内のリンクをクリックして変更を確定してください。
              </p>
              <Show when={verifyUrl()}>
                {(url) => (
                  <p class={styles.devNote}>
                    [DEV] メール送信をスキップ:{" "}
                    <a href={url()} class={styles.devLink}>
                      このリンクで直接確定する
                    </a>
                  </p>
                )}
              </Show>
            </>
          }
        >
          <form onSubmit={handleEmailSubmit} class={styles.form}>
            <Field
              id="settings-new-email"
              label="新しいメールアドレス"
              type="email"
              value={newEmail()}
              onInput={(e) => setNewEmail(e.currentTarget.value)}
              placeholder="例：new-owner@example.com"
              required
              disabled={emailSubmitting()}
              error={emailError()}
            />
            <Button type="submit" disabled={emailSubmitting()}>
              {emailSubmitting() ? "送信中..." : "変更をリクエスト"}
            </Button>
          </form>
        </Show>
      </section>

      <section class={styles.section}>
        <h2 class={styles.heading}>セッション</h2>
        <p class={styles.currentEmail}>
          自分の全端末のログインセッションを終了します。
        </p>
        <Button
          variant="secondary"
          disabled={loggingOutAll()}
          onClick={handleLogoutAll}
        >
          {loggingOutAll() ? "処理中..." : "ログアウト（全端末）"}
        </Button>
      </section>
    </div>
  );
}
