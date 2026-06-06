import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders the trigger button", () => {
    render(() => (
      <ConfirmDialog
        triggerLabel="削除"
        title="削除の確認"
        description="削除しますか？"
        onConfirm={() => {}}
      />
    ));
    expect(screen.getByRole("button", { name: "削除" })).toBeTruthy();
  });

  it("opens alertdialog with title and description when trigger is clicked", async () => {
    const user = userEvent.setup();
    render(() => (
      <ConfirmDialog
        triggerLabel="削除"
        title="削除の確認"
        description="この操作は元に戻せません"
        onConfirm={() => {}}
      />
    ));

    await user.click(screen.getByRole("button", { name: "削除" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByText("削除の確認")).toBeTruthy();
    expect(screen.getByText("この操作は元に戻せません")).toBeTruthy();
  });

  it("calls onConfirm and closes dialog when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(() => (
      <ConfirmDialog
        triggerLabel="削除"
        title="削除の確認"
        description="削除しますか？"
        onConfirm={onConfirm}
      />
    ));

    await user.click(screen.getByRole("button", { name: "削除" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "削除する" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not call onConfirm and closes dialog when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(() => (
      <ConfirmDialog
        triggerLabel="削除"
        title="削除の確認"
        description="削除しますか？"
        onConfirm={onConfirm}
      />
    ));

    await user.click(screen.getByRole("button", { name: "削除" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("uses custom confirmLabel when provided", async () => {
    const user = userEvent.setup();
    render(() => (
      <ConfirmDialog
        triggerLabel="停止"
        title="確認"
        description="停止しますか？"
        confirmLabel="停止する"
        onConfirm={() => {}}
      />
    ));

    await user.click(screen.getByRole("button", { name: "停止" }));
    await screen.findByRole("alertdialog");

    expect(screen.getByRole("button", { name: "停止する" })).toBeTruthy();
  });

  it("disables buttons while async onConfirm is pending", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    render(() => (
      <ConfirmDialog
        triggerLabel="削除"
        title="削除の確認"
        description="削除しますか？"
        onConfirm={onConfirm}
      />
    ));

    await user.click(screen.getByRole("button", { name: "削除" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "削除する" }));

    expect(
      (screen.getByRole("button", { name: "削除する" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "キャンセル" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    resolve();
  });

  it("uses aria-label on trigger button", () => {
    render(() => (
      <ConfirmDialog
        triggerLabel="削除"
        aria-label="削除 食事"
        title="削除の確認"
        description="削除しますか？"
        onConfirm={() => {}}
      />
    ));
    expect(screen.getByRole("button", { name: "削除 食事" })).toBeTruthy();
  });
});
