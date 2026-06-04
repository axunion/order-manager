import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import Field from "./Field";

describe("Field", () => {
  it("renders a label and input with correct association", () => {
    const { getByLabelText, getByRole } = render(() => (
      <Field id="store-name" label="店舗名" />
    ));
    expect(getByLabelText("店舗名")).toBeTruthy();
    expect(getByRole("textbox")).toBeTruthy();
  });

  it("shows an error message when error prop is provided", () => {
    const { getByRole } = render(() => (
      <Field id="name" label="名前" error="入力してください" />
    ));
    const alert = getByRole("alert");
    expect(alert.textContent).toContain("入力してください");
  });

  it("does not show error alert when error is empty", () => {
    const { queryByRole } = render(() => <Field id="name" label="名前" />);
    expect(queryByRole("alert")).toBeNull();
  });

  it("passes additional input props (placeholder, required, etc.)", () => {
    const { getByPlaceholderText } = render(() => (
      <Field id="shop" label="店舗名" placeholder="例：山田珈琲店" required />
    ));
    const input = getByPlaceholderText("例：山田珈琲店") as HTMLInputElement;
    expect(input.required).toBe(true);
  });

  it("passes disabled state to the input", () => {
    const { getByRole } = render(() => (
      <Field id="f" label="フィールド" disabled />
    ));
    const input = getByRole("textbox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
