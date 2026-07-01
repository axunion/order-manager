import styles from "./QuantityStepper.module.css";

export default function QuantityStepper(props: {
  itemName: string;
  quantity: number;
  decreaseDisabled: boolean;
  increaseDisabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div class={styles.control}>
      <button
        type="button"
        class={styles.btn}
        aria-label={`${props.itemName}の数量を減らす`}
        onClick={props.onDecrease}
        disabled={props.decreaseDisabled}
      >
        −
      </button>
      <span class={styles.value}>{props.quantity}</span>
      <button
        type="button"
        class={styles.btn}
        aria-label={`${props.itemName}の数量を増やす`}
        onClick={props.onIncrease}
        disabled={props.increaseDisabled}
      >
        ＋
      </button>
    </div>
  );
}
