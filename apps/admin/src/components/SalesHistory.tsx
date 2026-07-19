import { jstDayRange, todayJst } from "@order/core";
import { apiFetch } from "@order/core/client";
import { Button, ErrorAlert } from "@order/ui";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import styles from "./SalesHistory.module.css";

type SalesItem = {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  status: "ordered" | "served" | "cancelled";
};

type PaymentMethod = "cash" | "card" | "qr";

type Payment = {
  id: string;
  order_id: string;
  seat_name: string;
  total_amount: number;
  method: PaymentMethod;
  discount_amount: number;
  discount_reason: string | null;
  paid_at: number;
  items: SalesItem[];
};

/** The pre-discount items total: what's actually charged is total_amount. */
function itemsTotal(payment: Payment): number {
  return payment.total_amount + payment.discount_amount;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "現金",
  card: "カード",
  qr: "QR決済",
};

/** Shifts a "YYYY-MM-DD" calendar date by `deltaDays`, using UTC arithmetic
 * so month/year rollovers are handled by the platform's Date implementation. */
export function shiftDate(dateStr: string, deltaDays: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const shifted = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + deltaDays),
  );
  return shifted.toISOString().slice(0, 10);
}

const formatCurrency = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

export default function SalesHistory() {
  const [date, setDate] = createSignal(todayJst());
  const [payments, setPayments] = createSignal<Payment[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError("");
    const { from, to } = jstDayRange(date());
    const result = await apiFetch<Payment[]>(
      `/api/payments?from=${from}&to=${to}`,
    );
    if (result.ok && result.data) {
      setPayments(result.data);
    } else {
      setPayments([]);
      setError(result.message ?? "売上データの取得に失敗しました。");
    }
    setLoading(false);
  }

  createEffect(() => {
    date();
    load();
  });

  const totalRevenue = createMemo(() =>
    payments().reduce((sum, p) => sum + p.total_amount, 0),
  );
  const checkCount = createMemo(() => payments().length);
  const averagePerCheck = createMemo(() =>
    checkCount() === 0 ? 0 : Math.round(totalRevenue() / checkCount()),
  );
  const methodTotals = createMemo(() => {
    const totals = new Map<PaymentMethod, number>();
    for (const p of payments()) {
      totals.set(p.method, (totals.get(p.method) ?? 0) + p.total_amount);
    }
    return (Object.keys(METHOD_LABELS) as PaymentMethod[]).map((method) => ({
      method,
      label: METHOD_LABELS[method],
      amount: totals.get(method) ?? 0,
    }));
  });

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div class={styles.salesHistory}>
      <div class={styles.dateNav}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDate(shiftDate(date(), -1))}
        >
          ← 前日
        </Button>
        <input
          type="date"
          class={styles.dateInput}
          aria-label="日付"
          value={date()}
          onInput={(e) => setDate(e.currentTarget.value)}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDate(shiftDate(date(), 1))}
        >
          翌日 →
        </Button>
      </div>

      <Show when={error()}>
        <ErrorAlert>{error()}</ErrorAlert>
      </Show>

      <Show when={!loading() && !error()}>
        <div class={styles.stats}>
          <div class={styles.statCard}>
            <span class={styles.statLabel}>売上合計</span>
            <span class={styles.statValue}>
              {formatCurrency(totalRevenue())}
            </span>
          </div>
          <div class={styles.statCard}>
            <span class={styles.statLabel}>会計件数</span>
            <span class={styles.statValue}>{checkCount()}件</span>
          </div>
          <div class={styles.statCard}>
            <span class={styles.statLabel}>平均単価</span>
            <span class={styles.statValue}>
              {formatCurrency(averagePerCheck())}
            </span>
          </div>
        </div>

        <ul class={styles.methodBreakdown} aria-label="支払い方法別内訳">
          <For each={methodTotals()}>
            {(entry) => (
              <li class={styles.methodBreakdownItem}>
                <span class={styles.methodBreakdownLabel}>{entry.label}</span>
                <span class={styles.methodBreakdownAmount}>
                  {formatCurrency(entry.amount)}
                </span>
              </li>
            )}
          </For>
        </ul>

        <Show
          when={payments().length > 0}
          fallback={
            <div class={styles.empty}>
              <p>この日の会計はありません</p>
            </div>
          }
        >
          <ul class={styles.checkList} aria-label="会計一覧">
            <For each={payments()}>
              {(payment) => (
                <li class={styles.checkItem}>
                  <button
                    type="button"
                    class={styles.checkHeader}
                    onClick={() => toggleExpanded(payment.id)}
                    aria-expanded={expanded().has(payment.id)}
                  >
                    <span class={styles.checkTime}>
                      {formatTime(payment.paid_at)}
                    </span>
                    <span class={styles.checkSeat}>{payment.seat_name}</span>
                    <span class={styles.checkMethod}>
                      {METHOD_LABELS[payment.method]}
                    </span>
                    <span class={styles.checkTotal}>
                      <Show when={payment.discount_amount > 0}>
                        <span class={styles.checkTotalOriginal}>
                          {formatCurrency(itemsTotal(payment))}
                        </span>
                      </Show>
                      {formatCurrency(payment.total_amount)}
                    </span>
                  </button>
                  <Show when={expanded().has(payment.id)}>
                    <ul class={styles.itemList}>
                      <For each={payment.items}>
                        {(item) => (
                          <li
                            class={`${styles.item} ${item.status === "cancelled" ? styles.itemCancelled : ""}`}
                          >
                            <span class={styles.itemName}>
                              {item.name_snapshot}
                            </span>
                            <span class={styles.itemQty}>
                              × {item.quantity}
                            </span>
                            <span class={styles.itemPrice}>
                              {formatCurrency(
                                item.unit_price_snapshot * item.quantity,
                              )}
                            </span>
                          </li>
                        )}
                      </For>
                      <Show when={payment.discount_amount > 0}>
                        <li class={styles.discountItem}>
                          <span class={styles.itemName}>
                            割引
                            {payment.discount_reason
                              ? `（${payment.discount_reason}）`
                              : ""}
                          </span>
                          <span class={styles.itemPrice}>
                            -{formatCurrency(payment.discount_amount)}
                          </span>
                        </li>
                      </Show>
                    </ul>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}
