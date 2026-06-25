import { apiFetch, jsonFetch } from "@order/core/client";
import { Button, ConfirmDialog, ErrorAlert } from "@order/ui";
import QRCode from "qrcode";
import { createSignal, For, onMount, Show } from "solid-js";
import styles from "./SeatManager.module.css";

type Seat = {
  id: string;
  store_id: string;
  name: string;
  qr_token: string;
  created_at: number;
};

async function generateQrDataUrl(qrToken: string): Promise<string> {
  const orderBase =
    (import.meta as { env?: Record<string, string> }).env?.VITE_ORDER_BASE ??
    "";
  const url = `${orderBase}/${qrToken}`;
  return QRCode.toDataURL(url, { width: 160, margin: 1 });
}

export default function SeatManager() {
  const [seats, setSeats] = createSignal<Seat[]>([]);
  const [qrUrls, setQrUrls] = createSignal<Record<string, string>>({});
  const [error, setError] = createSignal("");
  const [seatName, setSeatName] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);

  async function loadSeats() {
    const result = await apiFetch<Seat[]>("/api/seats");
    if (result.ok && result.data) {
      setSeats(result.data);
      const settled = await Promise.allSettled(
        result.data.map(async (seat) => ({
          id: seat.id,
          url: await generateQrDataUrl(seat.qr_token),
        })),
      );
      const urls: Record<string, string> = {};
      let hasQrError = false;
      for (const r of settled) {
        if (r.status === "fulfilled") {
          urls[r.value.id] = r.value.url;
        } else {
          hasQrError = true;
        }
      }
      setQrUrls(urls);
      if (hasQrError) setError("一部の QR コードを生成できませんでした。");
    }
  }

  onMount(async () => {
    await loadSeats();
  });

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await jsonFetch<Seat>("/api/seats", "POST", {
        name: seatName(),
      });
      if (!result.ok || !result.data) {
        setError(result.message ?? "エラーが発生しました");
        return;
      }
      const newSeat = result.data;
      setSeatName("");
      setSeats((prev) => [...prev, newSeat]);
      try {
        const qrUrl = await generateQrDataUrl(newSeat.qr_token);
        setQrUrls((prev) => ({ ...prev, [newSeat.id]: qrUrl }));
      } catch {
        setError("QR コードの生成に失敗しました。");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError("");
    const result = await apiFetch(`/api/seats/${id}`, { method: "DELETE" });
    if (!result.ok) {
      setError(result.message ?? "削除に失敗しました");
      return;
    }
    setSeats((prev) => prev.filter((s) => s.id !== id));
    setQrUrls((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleCopyUrl = async (qrToken: string) => {
    const orderBase =
      (import.meta as { env?: Record<string, string> }).env?.VITE_ORDER_BASE ??
      "";
    const url = `${orderBase}/${qrToken}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setError("URLのコピーに失敗しました。手動でコピーしてください。");
    }
  };

  return (
    <div class={styles.seatManager}>
      <Show when={error()}>
        <ErrorAlert>{error()}</ErrorAlert>
      </Show>

      <section class={styles.seatSection}>
        <h2>座席を追加</h2>
        <form onSubmit={handleSubmit} class={styles.seatForm}>
          <div class={styles.field}>
            <label for="seat-name">座席名</label>
            <input
              id="seat-name"
              type="text"
              value={seatName()}
              onInput={(e) => setSeatName(e.currentTarget.value)}
              placeholder="例：テーブル1"
              required
              maxLength={100}
              disabled={submitting()}
            />
          </div>
          <Button type="submit" disabled={submitting()}>
            {submitting() ? "追加中..." : "座席を追加"}
          </Button>
        </form>
      </section>

      <section class={styles.seatSection}>
        <h2>座席一覧</h2>
        <Show
          when={seats().length > 0}
          fallback={<p class={styles.empty}>座席がまだありません</p>}
        >
          <ul class={styles.seatList}>
            <For each={seats()}>
              {(seat) => {
                const orderBase =
                  (import.meta as { env?: Record<string, string> }).env
                    ?.VITE_ORDER_BASE ?? "";
                const orderUrl = () => `${orderBase}/${seat.qr_token}`;
                return (
                  <li class={styles.seatListItem}>
                    <div class={styles.seatInfo}>
                      <span class={styles.itemName}>{seat.name}</span>
                      <a
                        class={styles.seatUrl}
                        href={orderUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {orderUrl()}
                      </a>
                    </div>
                    <Show when={qrUrls()[seat.id]}>
                      <div class={styles.seatQr}>
                        <img
                          src={qrUrls()[seat.id]}
                          alt={`QR ${seat.name}`}
                          width={160}
                          height={160}
                        />
                      </div>
                    </Show>
                    <div class={styles.seatActions}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopyUrl(seat.qr_token)}
                      >
                        URLをコピー
                      </Button>
                      <ConfirmDialog
                        triggerLabel="削除"
                        aria-label={`削除 ${seat.name}`}
                        title="座席の削除"
                        description={`「${seat.name}」を削除しますか？この操作は元に戻せません。`}
                        onConfirm={() => handleDelete(seat.id)}
                      />
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
