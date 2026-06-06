import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Select from "./Select";

const OPTIONS = [
  { value: "c1", label: "ドリンク" },
  { value: "c2", label: "フード" },
];

describe("Select", () => {
  it("renders trigger button with aria-label", () => {
    render(() => (
      <Select
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        aria-label="カテゴリ"
      />
    ));
    expect(screen.getByRole("button", { name: /カテゴリ/ })).toBeTruthy();
  });

  it("shows selected option label in trigger", () => {
    render(() => (
      <Select
        options={OPTIONS}
        value="c1"
        onChange={() => {}}
        aria-label="カテゴリ"
      />
    ));
    const trigger = screen.getByRole("button", { name: /カテゴリ/ });
    expect(trigger.textContent).toContain("ドリンク");
  });

  it("opens listbox and calls onChange with option value when clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(() => (
      <Select
        options={OPTIONS}
        value={null}
        onChange={onChange}
        aria-label="カテゴリ"
      />
    ));

    await user.click(screen.getByRole("button", { name: /カテゴリ/ }));
    const option = await screen.findByRole("option", { name: "ドリンク" });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith("c1");
  });

  it("is disabled when disabled prop is true", () => {
    render(() => (
      <Select
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        aria-label="カテゴリ"
        disabled
      />
    ));
    const trigger = screen.getByRole("button", { name: /カテゴリ/ });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows placeholder text when value is null", () => {
    render(() => (
      <Select
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        aria-label="カテゴリ"
        placeholder="-- なし --"
      />
    ));
    const trigger = screen.getByRole("button", { name: /カテゴリ/ });
    expect(trigger.textContent).toContain("-- なし --");
  });
});
