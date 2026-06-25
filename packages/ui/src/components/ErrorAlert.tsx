import type { ParentProps } from "solid-js";
import styles from "./ErrorAlert.module.css";

/** Renders an error message as a styled alert paragraph. */
export default function ErrorAlert(props: ParentProps) {
  return (
    <p class={styles.errorAlert} role="alert">
      {props.children}
    </p>
  );
}
