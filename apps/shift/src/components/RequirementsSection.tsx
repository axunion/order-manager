import type {
  PositionResponse,
  StaffingRequirementResponse,
} from "@order/core";
import { apiFetch, jsonFetch } from "@order/core/client";
import { Button, Card } from "@order/ui";
import { createSignal, For, Show } from "solid-js";
import { formatMinutes, parseMinutes } from "../lib/format";
import styles from "./SettingsSection.module.css";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * The weekly template the coverage grid measures a schedule against: for a
 * weekday, a position and a band, how many people the store needs. v1 has no
 * per-date override — a holiday is handled by the manager reading the grid.
 */
export default function RequirementsSection(props: {
  requirements: StaffingRequirementResponse[];
  positions: PositionResponse[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [weekday, setWeekday] = createSignal(1);
  const [positionId, setPositionId] = createSignal("");
  const [start, setStart] = createSignal(540);
  const [end, setEnd] = createSignal(1020);
  const [headcount, setHeadcount] = createSignal(1);
  const [busy, setBusy] = createSignal(false);

  const run = async (request: Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    try {
      const result = await request;
      if (!result.ok) {
        props.onError(result.message ?? "更新に失敗しました。");
        return;
      }
      await props.onChanged();
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const target = positionId() || props.positions[0]?.id;
    if (!target) return;
    return run(
      jsonFetch("/api/shift/templates/requirements", "POST", {
        weekday: weekday(),
        position_id: target,
        start_minutes: start(),
        end_minutes: end() <= start() ? end() + 1440 : end(),
        required_headcount: headcount(),
      }),
    );
  };

  const positionName = (id: string) =>
    props.positions.find((p) => p.id === id)?.name ?? "不明なポジション";

  return (
    <Card title="必要人数" class={styles.section}>
      <Show
        when={props.positions.length > 0}
        fallback={
          <p class={styles.empty}>先にポジションを登録してください。</p>
        }
      >
        <Show
          when={props.requirements.length > 0}
          fallback={<p class={styles.empty}>まだ登録がありません。</p>}
        >
          <ul class={styles.list}>
            <For each={props.requirements}>
              {(requirement) => (
                <li class={styles.item}>
                  <span class={styles.label}>
                    {WEEKDAY_LABELS[requirement.weekday]}曜{" "}
                    {positionName(requirement.position_id)}{" "}
                    {formatMinutes(requirement.start_minutes)}–
                    {formatMinutes(requirement.end_minutes)}{" "}
                    {requirement.required_headcount}人
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy()}
                    onClick={() =>
                      run(
                        apiFetch(
                          `/api/shift/templates/requirements/${requirement.id}`,
                          { method: "DELETE" },
                        ),
                      )
                    }
                  >
                    削除
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <div class={styles.addRow}>
          <label class={styles.fieldLabel} for="requirement-weekday">
            曜日
            <select
              id="requirement-weekday"
              class={styles.select}
              value={String(weekday())}
              disabled={busy()}
              onChange={(e) => setWeekday(Number(e.currentTarget.value))}
            >
              <For each={WEEKDAY_LABELS}>
                {(label, index) => (
                  <option value={String(index())}>{label}</option>
                )}
              </For>
            </select>
          </label>

          <label class={styles.fieldLabel} for="requirement-position">
            ポジション
            <select
              id="requirement-position"
              class={styles.select}
              value={positionId()}
              disabled={busy()}
              onChange={(e) => setPositionId(e.currentTarget.value)}
            >
              <For each={props.positions}>
                {(position) => (
                  <option value={position.id}>{position.name}</option>
                )}
              </For>
            </select>
          </label>

          <label class={styles.fieldLabel} for="requirement-start">
            開始
            <input
              id="requirement-start"
              type="time"
              aria-label="必要人数の開始"
              class={styles.input}
              value={formatMinutes(start())}
              disabled={busy()}
              onInput={(e) => setStart(parseMinutes(e.currentTarget.value))}
            />
          </label>
          <label class={styles.fieldLabel} for="requirement-end">
            終了
            <input
              id="requirement-end"
              type="time"
              aria-label="必要人数の終了"
              class={styles.input}
              value={formatMinutes(end())}
              disabled={busy()}
              onInput={(e) => setEnd(parseMinutes(e.currentTarget.value))}
            />
          </label>
          <label class={styles.fieldLabel} for="requirement-headcount">
            人数
            <input
              id="requirement-headcount"
              type="number"
              min="0"
              max="999"
              class={`${styles.input} ${styles.numberInput}`}
              value={headcount()}
              disabled={busy()}
              onInput={(e) => setHeadcount(Number(e.currentTarget.value))}
            />
          </label>

          <Button disabled={busy()} onClick={add}>
            追加
          </Button>
        </div>
      </Show>
    </Card>
  );
}
