import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

// Type-safe lookups: TypeScript errors here if a variant/size is missing from CSS.
const VARIANT_CLASS: Record<Variant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  danger: styles.danger,
  ghost: styles.ghost,
};

const SIZE_CLASS: Record<Size, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

/**
 * Shared button component with variant and size support.
 * All styling is via CSS Modules referencing design tokens.
 */
export default function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "fullWidth",
    "class",
    "children",
  ]);

  const className = () =>
    [
      styles.btn,
      VARIANT_CLASS[local.variant ?? "primary"],
      SIZE_CLASS[local.size ?? "md"],
      local.fullWidth ? styles.fullWidth : "",
      local.class ?? "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <button class={className()} {...rest}>
      {local.children}
    </button>
  );
}
