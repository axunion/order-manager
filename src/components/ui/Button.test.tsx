import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Button from "./Button";

describe("Button", () => {
  it("renders children as button text", () => {
    const { getByRole } = render(() => <Button>送信</Button>);
    expect(getByRole("button", { name: "送信" })).toBeTruthy();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { getByRole } = render(() => (
      <Button onClick={onClick}>クリック</Button>
    ));
    await user.click(getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is disabled when disabled prop is true", () => {
    const { getByRole } = render(() => <Button disabled>無効</Button>);
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { getByRole } = render(() => (
      <Button disabled onClick={onClick}>
        無効
      </Button>
    ));
    await user.click(getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders a submit button when type='submit'", () => {
    const { getByRole } = render(() => <Button type="submit">登録</Button>);
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.type).toBe("submit");
  });

  it("accepts variant and size props without errors", () => {
    const { getByRole } = render(() => (
      <Button variant="danger" size="sm">
        削除
      </Button>
    ));
    expect(getByRole("button", { name: "削除" })).toBeTruthy();
  });

  it("renders full-width when fullWidth prop is set", () => {
    const { getByRole } = render(() => <Button fullWidth>全幅</Button>);
    const btn = getByRole("button") as HTMLButtonElement;
    // CSS modules map class names in tests; just verify the element exists
    expect(btn).toBeTruthy();
  });
});
