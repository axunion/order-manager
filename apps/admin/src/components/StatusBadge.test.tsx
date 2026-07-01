import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import StatusBadge from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders children text", () => {
    const { getByText } = render(() => (
      <StatusBadge tone="alert">新規注文</StatusBadge>
    ));
    expect(getByText("新規注文")).toBeTruthy();
  });

  it.each([
    ["alert", "新規注文"],
    ["warning", "会計要求中"],
    ["success", "販売中"],
    ["danger", "品切れ"],
  ] as const)("renders %s tone badge with label %s", (tone, label) => {
    const { getByText } = render(() => (
      <StatusBadge tone={tone}>{label}</StatusBadge>
    ));
    expect(getByText(label)).toBeTruthy();
  });
});
