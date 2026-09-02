import type { SchedulePeriodResponse } from "@order/core";
import { halfMonthPeriod, jstDayRange } from "@order/core";
import { apiFetch, jsonFetch } from "@order/core/client";
import { Button, Card, ErrorAlert } from "@order/ui";
import { A } from "@solidjs/router";
import { createSignal, For, onMount, Show } from "solid-js";
import ShiftLayout from "../layouts/ShiftLayout";
import { formatWorkDate, PERIOD_STATUS_LABEL } from "../lib/format";
import styles from "./PeriodsPage.module.css";

/** Today in JST, as the YYYY-MM-DD the date inputs and the API both use. */
function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function PeriodsPage() {
  const [periods, setPeriods] = createSignal<SchedulePeriodResponse[]>([]);
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [creating, setCreating] = createSignal(false);
  const [coverDate, setCoverDate] = createSignal(todayJst());
  const [deadline, setDeadline] = createSignal(todayJst());

  const load = async () => {
    const result =
      await apiFetch<SchedulePeriodResponse[]>("/api/shift/periods");
    if (!result.ok || !result.data) {
      setError(result.message ?? "期間の取得に失敗しました。");
      return;
    }
    setPeriods(result.data);
  };

  onMount(async () => {
    await load();
    setLoading(false);
  });

  /**
   * The API only accepts whole half-months, so the form asks for a date the
   * period should contain and derives the bounds rather than letting a manager
   * type two dates that will be rejected.
   */
  const bounds = () => {
    try {
      return halfMonthPeriod(coverDate());
    } catch {
      return null;
    }
  };

  const create = async () => {
    const range = bounds();
    if (!range) return;
    setError("");
    setCreating(true);
    try {
      const result = await jsonFetch<SchedulePeriodResponse>(
        "/api/shift/periods",
        "POST",
        {
          ...range,
          // The deadline is the end of the chosen day, not its first moment.
          submission_deadline: jstDayRange(deadline()).to,
        },
      );
      if (!result.ok) {
        setError(result.message ?? "期間の作成に失敗しました。");
        return;
      }
      await load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <ShiftLayout title="シフト期間">
      <Show when={error()}>
        <ErrorAlert>{error()}</ErrorAlert>
      </Show>

      <p class={styles.settingsRow}>
        <A href="/settings" class={styles.settingsLink}>
          ポジション・パターン・必要人数の設定
        </A>
      </p>

      <Card title="期間を作成" class={styles.section}>
        <div class={styles.createForm}>
          <label class={styles.formLabel} for="cover-date">
            期間に含まれる日
            <input
              id="cover-date"
              type="date"
              class={styles.dateInput}
              value={coverDate()}
              onInput={(e) => setCoverDate(e.currentTarget.value)}
            />
          </label>
          <label class={styles.formLabel} for="deadline-date">
            希望提出の締切
            <input
              id="deadline-date"
              type="date"
              class={styles.dateInput}
              value={deadline()}
              onInput={(e) => setDeadline(e.currentTarget.value)}
            />
          </label>
          <Button disabled={creating() || !bounds()} onClick={create}>
            作成する
          </Button>
        </div>
        <Show
          when={bounds()}
          fallback={<p class={styles.hint}>日付を選んでください。</p>}
        >
          {(range) => (
            <p class={styles.hint}>
              {formatWorkDate(range().start_date)}〜
              {formatWorkDate(range().end_date)} の半月分を作成します。
            </p>
          )}
        </Show>
      </Card>

      <Show
        when={!loading()}
        fallback={<p class={styles.empty}>読み込み中…</p>}
      >
        <Card title="期間一覧" class={styles.section}>
          <Show
            when={periods().length > 0}
            fallback={<p class={styles.empty}>まだ期間がありません。</p>}
          >
            <ul class={styles.periodList}>
              <For each={periods()}>
                {(period) => (
                  <li class={styles.periodItem}>
                    <A href={`/periods/${period.id}`} class={styles.periodLink}>
                      {formatWorkDate(period.start_date)}〜
                      {formatWorkDate(period.end_date)}
                    </A>
                    <span class={styles.status}>
                      {PERIOD_STATUS_LABEL[period.status]}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Card>
      </Show>
    </ShiftLayout>
  );
}
