/**
 * Email delivery via the Resend REST API.
 *
 * When RESEND_API_KEY is not set (local dev), the Magic Link URL is written
 * to the console instead of being sent, so the full auth flow can be tested
 * without a live Resend account.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "noreply@order-manager.example.com";

interface SendMagicLinkOptions {
  to: string;
  magicLinkUrl: string;
  purpose: "signup" | "login";
}

/**
 * Sends a Magic Link email to the store owner.
 *
 * In local dev (RESEND_API_KEY unset) the URL is logged to the console
 * and the function returns without making a network request.
 *
 * Throws on Resend API errors so callers can surface a 500 to the client.
 * The stores record is intentionally NOT rolled back on failure (pending
 * status is kept so the owner can retry via /login).
 */
export async function sendMagicLinkEmail(
  { to, magicLinkUrl, purpose }: SendMagicLinkOptions,
  env: Env,
): Promise<void> {
  // Local-dev fallback: no API key → log URL to console.
  if (!env.RESEND_API_KEY) {
    console.log(
      `[email] Magic Link (${purpose}) for ${to} — open in browser:\n  ${magicLinkUrl}`,
    );
    return;
  }

  const from = env.MAIL_FROM || DEFAULT_FROM;
  const { subject, html } = buildEmailContent(purpose, magicLinkUrl);

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "order-manager/1.0",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
}

function buildEmailContent(
  purpose: "signup" | "login",
  magicLinkUrl: string,
): { subject: string; html: string } {
  if (purpose === "signup") {
    return {
      subject: "メールアドレスを確認してください",
      html: `
        <p>オーダーマネージャーへのお申し込みありがとうございます。</p>
        <p>以下のリンクをクリックしてメールアドレスを確認し、管理画面へ進んでください。<br>
        このリンクは15分間有効です。</p>
        <p><a href="${magicLinkUrl}">${magicLinkUrl}</a></p>
        <p>このメールに心当たりがない場合は無視してください。</p>
      `,
    };
  }
  return {
    subject: "ログインリンク",
    html: `
      <p>以下のリンクをクリックして管理画面にログインしてください。<br>
      このリンクは15分間有効で、一度しか使用できません。</p>
      <p><a href="${magicLinkUrl}">${magicLinkUrl}</a></p>
      <p>このメールに心当たりがない場合は無視してください。</p>
    `,
  };
}
