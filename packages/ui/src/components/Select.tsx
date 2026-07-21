import { Select as KobalteSelect } from "@kobalte/core/select";
import styles from "./Select.module.css";

type SelectOption = { value: string; label: string };

/**
 * Every usage must give the trigger an accessible name: either pass `id`
 * and pair it with an external `<label for={id}>` (labels associate with
 * button elements, which is what the trigger renders as), or pass
 * `aria-label` directly for cases with no visible label. Neither is
 * enforced by the type — TypeScript can't verify a DOM label association —
 * so this is left as a contract for callers to honor.
 */
interface SelectProps {
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  class?: string;
}

export default function Select(props: SelectProps) {
  const selectedOption = () =>
    props.options.find((o) => o.value === props.value) ?? null;

  return (
    <div class={styles.wrapper}>
      <KobalteSelect<SelectOption>
        options={props.options}
        optionValue="value"
        optionTextValue="label"
        value={selectedOption()}
        onChange={(opt) => opt && props.onChange(opt.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        itemComponent={(itemProps) => (
          <KobalteSelect.Item item={itemProps.item} class={styles.item}>
            <KobalteSelect.ItemLabel class={styles.itemLabel}>
              {itemProps.item.rawValue.label}
            </KobalteSelect.ItemLabel>
            <KobalteSelect.ItemIndicator class={styles.itemIndicator}>
              ✓
            </KobalteSelect.ItemIndicator>
          </KobalteSelect.Item>
        )}
      >
        <KobalteSelect.Trigger
          id={props.id}
          aria-label={props["aria-label"]}
          class={[styles.trigger, props.class].filter(Boolean).join(" ")}
        >
          <KobalteSelect.Value<SelectOption> class={styles.value}>
            {(state) => state.selectedOption().label}
          </KobalteSelect.Value>
          <KobalteSelect.Icon class={styles.icon} aria-hidden="true">
            ▾
          </KobalteSelect.Icon>
        </KobalteSelect.Trigger>
        <KobalteSelect.Portal>
          <KobalteSelect.Content class={styles.content}>
            <KobalteSelect.Listbox class={styles.listbox} />
          </KobalteSelect.Content>
        </KobalteSelect.Portal>
      </KobalteSelect>
    </div>
  );
}
