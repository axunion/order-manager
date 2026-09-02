import { Show } from "solid-js";
import { useStoreInfo } from "../layouts/ShiftGuard";
import MySchedulePage from "./MySchedulePage";
import PeriodsPage from "./PeriodsPage";

/**
 * One route, two products: a manager lands on the period list they build
 * from, a staff member on their own published shifts. The API enforces the
 * split — every owner endpoint is owner-only — so this is UX, not a guard.
 */
export default function HomePage() {
  const store = useStoreInfo();

  return (
    <Show when={store.role === "owner"} fallback={<MySchedulePage />}>
      <PeriodsPage />
    </Show>
  );
}
