import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import Card from "./Card";

describe("Card", () => {
  it("renders children inside a card container", () => {
    const { getByText } = render(() => <Card>カード内容</Card>);
    expect(getByText("カード内容")).toBeTruthy();
  });

  it("renders a heading when title prop is provided", () => {
    const { getByRole } = render(() => (
      <Card title="テストカード">コンテンツ</Card>
    ));
    expect(getByRole("heading", { name: "テストカード" })).toBeTruthy();
  });

  it("does not render a heading when title is omitted", () => {
    const { queryByRole } = render(() => <Card>コンテンツ</Card>);
    expect(queryByRole("heading")).toBeNull();
  });

  it("renders as an article element by default", () => {
    const { container } = render(() => <Card>内容</Card>);
    expect(container.querySelector("article")).toBeTruthy();
  });
});
