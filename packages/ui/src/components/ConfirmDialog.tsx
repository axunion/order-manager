import { AlertDialog } from "@kobalte/core/alert-dialog";
import { createSignal } from "solid-js";
import type { Size, Variant } from "./Button";
import Button from "./Button";
import styles from "./ConfirmDialog.module.css";

interface ConfirmDialogProps {
  triggerLabel: string;
  triggerVariant?: Variant;
  triggerSize?: Size;
  triggerDisabled?: boolean;
  "aria-label"?: string;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmVariant?: Variant;
  onConfirm: () => void | Promise<void>;
}

export default function ConfirmDialog(props: ConfirmDialogProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [isConfirming, setIsConfirming] = createSignal(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await props.onConfirm();
    } finally {
      setIsConfirming(false);
      setIsOpen(false);
    }
  };

  return (
    <>
      <Button
        variant={props.triggerVariant ?? "danger"}
        size={props.triggerSize ?? "sm"}
        disabled={props.triggerDisabled}
        aria-label={props["aria-label"]}
        onClick={() => setIsOpen(true)}
      >
        {props.triggerLabel}
      </Button>
      <AlertDialog open={isOpen()} onOpenChange={setIsOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay class={styles.overlay} />
          <div class={styles.positioner}>
            <AlertDialog.Content class={styles.content}>
              <AlertDialog.Title class={styles.title}>
                {props.title}
              </AlertDialog.Title>
              <AlertDialog.Description class={styles.description}>
                {props.description}
              </AlertDialog.Description>
              <div class={styles.footer}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isConfirming()}
                  onClick={() => setIsOpen(false)}
                >
                  キャンセル
                </Button>
                <Button
                  variant={props.confirmVariant ?? "danger"}
                  size="sm"
                  disabled={isConfirming()}
                  onClick={handleConfirm}
                >
                  {props.confirmLabel ?? "削除する"}
                </Button>
              </div>
            </AlertDialog.Content>
          </div>
        </AlertDialog.Portal>
      </AlertDialog>
    </>
  );
}
