import { createSignal, For, Show } from "solid-js";
import styles from "./CategoryNav.module.css";
import type { MenuGroup } from "./OrderScreen";
import { categoryElementId } from "./OrderScreen";

export default function CategoryNav(props: { groups: MenuGroup[] }) {
  const [activeKey, setActiveKey] = createSignal<string | null>(null);

  function handleSelect(key: string) {
    setActiveKey(key);
    document
      .getElementById(categoryElementId(key))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <Show when={props.groups.length > 0}>
      <nav class={styles.nav} aria-label="カテゴリー">
        <For each={props.groups}>
          {(group) => (
            <button
              type="button"
              class={
                activeKey() === group.key
                  ? `${styles.chip} ${styles.chipActive}`
                  : styles.chip
              }
              aria-current={activeKey() === group.key ? "true" : undefined}
              onClick={() => handleSelect(group.key)}
            >
              {group.categoryName}
            </button>
          )}
        </For>
      </nav>
    </Show>
  );
}
