import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";
import styles from "./Card.module.css";

interface CardProps extends JSX.HTMLAttributes<HTMLElement> {
  title?: string;
  children: JSX.Element;
}

/**
 * Surface container. Provides the card background, radius, and shadow.
 * Use the `title` prop to render an h2 heading inside the card.
 * All HTML attributes (id, aria-*, role, style, etc.) are forwarded to the
 * underlying <article> element.
 */
export default function Card(props: CardProps) {
  const [local, rest] = splitProps(props, ["title", "class", "children"]);

  return (
    <article
      class={[styles.card, local.class ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      <Show when={local.title}>
        <h2 class={styles.title}>{local.title}</h2>
      </Show>
      {local.children}
    </article>
  );
}
