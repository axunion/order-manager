import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import type { Order } from "./OrderScreen";
import OrderSummary from "./OrderSummary";

describe("OrderSummary", () => {
  it("includes selected option price deltas in the line price", () => {
    const order: Order = {
      id: "order1",
      status: "open",
      items: [
        {
          id: "oi1",
          name_snapshot: "パフェ",
          unit_price_snapshot: 500,
          quantity: 2,
          status: "ordered",
          created_at: 1000,
          options: [
            {
              id: "opt1",
              name_snapshot: "M",
              group_name_snapshot: "サイズ",
              price_delta_snapshot: 50,
            },
            {
              id: "opt2",
              name_snapshot: "アーモンド",
              group_name_snapshot: "トッピング",
              price_delta_snapshot: 50,
            },
          ],
          note: null,
        },
      ],
      total: 1200,
    };

    const { container } = render(() => <OrderSummary order={order} />);

    // (500 + 50 + 50) * 2 = 1200
    const linePrice = container.querySelector('[class*="itemPrice"]');
    expect(linePrice?.textContent).toBe("¥1,200");
  });

  it("renders each selected option name with its signed price delta", () => {
    const order: Order = {
      id: "order1",
      status: "open",
      items: [
        {
          id: "oi1",
          name_snapshot: "パフェ",
          unit_price_snapshot: 500,
          quantity: 1,
          status: "ordered",
          created_at: 1000,
          options: [
            {
              id: "opt1",
              name_snapshot: "M",
              group_name_snapshot: "サイズ",
              price_delta_snapshot: 50,
            },
            {
              id: "opt2",
              name_snapshot: "S",
              group_name_snapshot: "サイズ",
              price_delta_snapshot: 0,
            },
          ],
          note: null,
        },
      ],
      total: 550,
    };

    const { container } = render(() => <OrderSummary order={order} />);

    const optionTexts = Array.from(
      container.querySelectorAll('[class*="optionItem"]'),
    ).map((el) => el.textContent?.replace(/\s+/g, " ").trim());
    expect(optionTexts).toEqual(["M (+¥50)", "S"]);
  });

  it("renders the line note when present", () => {
    const order: Order = {
      id: "order1",
      status: "open",
      items: [
        {
          id: "oi1",
          name_snapshot: "パフェ",
          unit_price_snapshot: 500,
          quantity: 1,
          status: "ordered",
          created_at: 1000,
          options: [],
          note: "氷少なめ",
        },
      ],
      total: 500,
    };

    const { getByText } = render(() => <OrderSummary order={order} />);

    expect(getByText("氷少なめ")).toBeTruthy();
  });

  it("does not render an option list or note block when the item has neither", () => {
    const order: Order = {
      id: "order1",
      status: "open",
      items: [
        {
          id: "oi1",
          name_snapshot: "コーヒー",
          unit_price_snapshot: 500,
          quantity: 1,
          status: "ordered",
          created_at: 1000,
          options: [],
          note: null,
        },
      ],
      total: 500,
    };

    const { container } = render(() => <OrderSummary order={order} />);

    expect(container.querySelector('[class*="optionList"]')).toBeNull();
    expect(container.querySelector('[class*="itemNote"]')).toBeNull();
  });
});
