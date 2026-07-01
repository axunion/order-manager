import styles from "./Header.module.css";

export default function Header(props: { seatName: string }) {
  return (
    <header class={styles.header}>
      <h1 class={styles.title}>{props.seatName}</h1>
      <p class={styles.subtitle}>セルフオーダー</p>
    </header>
  );
}
