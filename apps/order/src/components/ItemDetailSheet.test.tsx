import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ItemDetailSheet from "./ItemDetailSheet";
import type { MenuItem } from "./OrderScreen";

const item: MenuItem = {
  id: "item1",
  category_id: "cat1",
  name: "パフェ",
  price: 500,
  sort_order: 0,
  description: "季節のフルーツをのせた自家製パフェ",
  image_key: null,
  option_groups: [
    {
      id: "g-size",
      name: "サイズ",
      min_select: 1,
      max_select: 1,
      sort_order: 0,
      options: [
        { id: "o-s", name: "S", price_delta: 0, sort_order: 0 },
        { id: "o-m", name: "M", price_delta: 50, sort_order: 1 },
        { id: "o-l", name: "L", price_delta: 100, sort_order: 2 },
      ],
    },
    {
      id: "g-topping",
      name: "トッピング",
      min_select: 0,
      max_select: 2,
      sort_order: 1,
      options: [
        { id: "o-a", name: "アーモンド", price_delta: 50, sort_order: 0 },
        { id: "o-b", name: "チョコソース", price_delta: 80, sort_order: 1 },
        { id: "o-c", name: "生クリーム", price_delta: 120, sort_order: 2 },
      ],
    },
  ],
};

// Kobalte's Dialog.Portal renders content as a sibling of the render()
// container (appended directly to document.body), so it must be queried
// via `screen` (scoped to document.body) rather than render()'s own
// destructured queries (scoped to just its container).

describe("ItemDetailSheet", () => {
  it("renders the item's name, description, and option groups", () => {
    render(() => (
      <ItemDetailSheet
        item={item}
        open={true}
        onOpenChange={vi.fn()}
        onAddItems={vi.fn()}
      />
    ));

    expect(screen.getByText("パフェ")).toBeTruthy();
    expect(screen.getByText("季節のフルーツをのせた自家製パフェ")).toBeTruthy();
    expect(screen.getByText(/サイズ/)).toBeTruthy();
    expect(screen.getByText(/トッピング/)).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^M/ })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /^アーモンド/ })).toBeTruthy();
  });

  it("disables submit until a required (min_select > 0) group has a selection", async () => {
    const user = userEvent.setup();
    render(() => (
      <ItemDetailSheet
        item={item}
        open={true}
        onOpenChange={vi.fn()}
        onAddItems={vi.fn()}
      />
    ));

    const submit = screen.getByRole("button", { name: /を注文する$/ });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("radio", { name: /^M/ }));
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables unchecked checkboxes once max_select is reached", async () => {
    const user = userEvent.setup();
    render(() => (
      <ItemDetailSheet
        item={item}
        open={true}
        onOpenChange={vi.fn()}
        onAddItems={vi.fn()}
      />
    ));

    await user.click(screen.getByRole("checkbox", { name: /^アーモンド/ }));
    await user.click(screen.getByRole("checkbox", { name: /^チョコソース/ }));

    expect(
      (
        screen.getByRole("checkbox", {
          name: /^生クリーム/,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: /^アーモンド/,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(false);
  });

  it("adds selected option deltas and quantity into the displayed total", async () => {
    const user = userEvent.setup();
    render(() => (
      <ItemDetailSheet
        item={item}
        open={true}
        onOpenChange={vi.fn()}
        onAddItems={vi.fn()}
      />
    ));

    await user.click(screen.getByRole("radio", { name: /^M/ }));
    await user.click(screen.getByRole("checkbox", { name: /^アーモンド/ }));
    // price 500 + M(50) + アーモンド(50) = 600
    expect(
      screen.getByRole("button", { name: "¥600 を注文する" }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "パフェの数量を増やす" }),
    );
    // quantity 2: 600 * 2 = 1200
    expect(
      screen.getByRole("button", { name: "¥1,200 を注文する" }),
    ).toBeTruthy();
  });

  it("submits option_ids in group order and the trimmed note, then calls onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    const onAddItems = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(() => (
      <ItemDetailSheet
        item={item}
        open={true}
        onOpenChange={onOpenChange}
        onAddItems={onAddItems}
      />
    ));

    await user.click(screen.getByRole("radio", { name: /^L/ }));
    await user.click(screen.getByRole("checkbox", { name: /^チョコソース/ }));
    await user.type(screen.getByLabelText("ご要望（任意）"), "  氷少なめ  ");
    await user.click(screen.getByRole("button", { name: /を注文する$/ }));

    expect(onAddItems).toHaveBeenCalledWith([
      {
        menu_item_id: "item1",
        quantity: 1,
        option_ids: ["o-l", "o-b"],
        note: "氷少なめ",
      },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the error message and keeps values when onAddItems fails", async () => {
    const onAddItems = vi
      .fn()
      .mockResolvedValue({ ok: false, message: "在庫がありません。" });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(() => (
      <ItemDetailSheet
        item={item}
        open={true}
        onOpenChange={onOpenChange}
        onAddItems={onAddItems}
      />
    ));

    await user.click(screen.getByRole("radio", { name: /^S/ }));
    await user.click(screen.getByRole("button", { name: /を注文する$/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("在庫がありません。");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("radio", { name: /^S/ }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("calls onOpenChange(false) when cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(() => (
      <ItemDetailSheet
        item={item}
        open={true}
        onOpenChange={onOpenChange}
        onAddItems={vi.fn()}
      />
    ));

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
