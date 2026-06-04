import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import styles from "./Field.module.css";

interface FieldProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
}

/**
 * Form field: label + input + optional error message.
 * Wraps a native <input type="text"> with token-based styling.
 * For other input types, use the input directly and import Field.module.css.
 */
export default function Field(props: FieldProps) {
  const [local, rest] = splitProps(props, ["id", "label", "error", "class"]);

  return (
    <div class={styles.field}>
      <label for={local.id} class={styles.label}>
        {local.label}
      </label>
      <input
        id={local.id}
        type="text"
        class={[
          styles.input,
          local.error ? styles.inputError : "",
          local.class ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-describedby={local.error ? `${local.id}-error` : undefined}
        {...rest}
      />
      {local.error && (
        <p id={`${local.id}-error`} class={styles.error} role="alert">
          {local.error}
        </p>
      )}
    </div>
  );
}
