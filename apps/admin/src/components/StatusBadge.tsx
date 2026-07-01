import type { JSX } from "solid-js";
import styles from "./StatusBadge.module.css";

export type BadgeTone = "alert" | "warning" | "success" | "danger";

interface StatusBadgeProps {
  tone: BadgeTone;
  children: JSX.Element;
}

const toneClass: Record<BadgeTone, string> = {
  alert: styles.alert ?? "",
  warning: styles.warning ?? "",
  success: styles.success ?? "",
  danger: styles.danger ?? "",
};

export default function StatusBadge(props: StatusBadgeProps) {
  return (
    <span class={`${styles.badge ?? ""} ${toneClass[props.tone]}`}>
      {props.children}
    </span>
  );
}
