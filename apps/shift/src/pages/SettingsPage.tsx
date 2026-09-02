import type {
  PositionResponse,
  ShiftMemberResponse,
  ShiftPatternResponse,
  StaffingRequirementResponse,
} from "@order/core";
import { apiFetch } from "@order/core/client";
import { ErrorAlert } from "@order/ui";
import { createSignal, onMount, Show } from "solid-js";
import MembersSection from "../components/MembersSection";
import PatternsSection from "../components/PatternsSection";
import PositionsSection from "../components/PositionsSection";
import RequirementsSection from "../components/RequirementsSection";
import ShiftLayout from "../layouts/ShiftLayout";
import styles from "./SettingsPage.module.css";

/**
 * Owns the four settings resources so the sections can stay presentational:
 * requirements and members both need the position list, and reloading one
 * section after a write must not leave another showing a stale name.
 */
export default function SettingsPage() {
  const [positions, setPositions] = createSignal<PositionResponse[]>([]);
  const [patterns, setPatterns] = createSignal<ShiftPatternResponse[]>([]);
  const [requirements, setRequirements] = createSignal<
    StaffingRequirementResponse[]
  >([]);
  const [members, setMembers] = createSignal<ShiftMemberResponse[]>([]);
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(true);

  const load = async () => {
    const [positionList, patternList, requirementList, memberList] =
      await Promise.all([
        apiFetch<PositionResponse[]>("/api/shift/positions"),
        apiFetch<ShiftPatternResponse[]>("/api/shift/templates/patterns"),
        apiFetch<StaffingRequirementResponse[]>(
          "/api/shift/templates/requirements",
        ),
        apiFetch<ShiftMemberResponse[]>("/api/shift/members"),
      ]);

    if (!positionList.ok) {
      setError(positionList.message ?? "設定の取得に失敗しました。");
      return;
    }
    setPositions(positionList.data ?? []);
    setPatterns(patternList.data ?? []);
    setRequirements(requirementList.data ?? []);
    setMembers(memberList.data ?? []);
  };

  onMount(async () => {
    await load();
    setLoading(false);
  });

  return (
    <ShiftLayout title="シフトの設定" backHref="/" backLabel="期間一覧">
      <Show when={error()}>
        <ErrorAlert>{error()}</ErrorAlert>
      </Show>

      <Show
        when={!loading()}
        fallback={<p class={styles.empty}>読み込み中…</p>}
      >
        <PositionsSection
          positions={positions()}
          onChanged={load}
          onError={setError}
        />
        <PatternsSection
          patterns={patterns()}
          onChanged={load}
          onError={setError}
        />
        <RequirementsSection
          requirements={requirements()}
          positions={positions()}
          onChanged={load}
          onError={setError}
        />
        <MembersSection
          members={members()}
          positions={positions()}
          onChanged={load}
          onError={setError}
        />
      </Show>
    </ShiftLayout>
  );
}
