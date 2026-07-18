import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MenuList from "./MenuList";
import type { MenuGroup, MenuItem } from "./OrderScreen";

const plainItem: MenuItem = {
  id: "item1",
  category_id: "cat1",
  name: "コーヒー",
  price: 500,
  sort_order: 0,
  description: null,
  image_key: null,
  option_groups: [],
};

const itemWithOptions: MenuItem = {
  id: "item2",
  category_id: "cat1",
  name: "ラーメン",
  price: 800,
  sort_order: 1,
  description: null,
  image_key: null,
  option_groups: [
    {
      id: "g1",
      name: "麺の量",
      min_select: 1,
      max_select: 1,
      sort_order: 0,
      options: [
        { id: "o1", name: "普通", price_delta: 0, sort_order: 0 },
        { id: "o2", name: "大盛り", price_delta: 100, sort_order: 1 },
      ],
    },
  ],
};

function makeGroups(items: MenuItem[]): MenuGroup[] {
  return [{ key: "cat1", categoryName: "メニュー", items }];
}

describe("MenuList", () => {
  it("renders the one-tap order button for an item without option groups", () => {
    const { getByRole, queryByRole } = render(() => (
      <MenuList groups={makeGroups([plainItem])} onAddItems={vi.fn()} />
    ));

    expect(getByRole("button", { name: "コーヒーを注文する" })).toBeTruthy();
    expect(queryByRole("button", { name: /オプションを選ぶ$/ })).toBeNull();
  });

  it("renders an 'オプションを選ぶ' button instead of the one-tap button for an item with option groups", () => {
    const { getByRole, queryByRole } = render(() => (
      <MenuList groups={makeGroups([itemWithOptions])} onAddItems={vi.fn()} />
    ));

    expect(getByRole("button", { name: /オプションを選ぶ$/ })).toBeTruthy();
    expect(queryByRole("button", { name: "ラーメンを注文する" })).toBeNull();
  });

  // Kobalte's Dialog.Portal renders the sheet as a sibling of render()'s own
  // container (appended to document.body), so it must be queried via
  // `screen` rather than render()'s destructured queries. The dialog title
  // is an <h2> ("heading" role), which disambiguates it from the item card's
  // plain-text name below, since both render "ラーメン" once the sheet opens.
  it("opens the item detail sheet showing the item's option groups when the trigger is clicked", async () => {
    const user = userEvent.setup();
    const { getByRole } = render(() => (
      <MenuList groups={makeGroups([itemWithOptions])} onAddItems={vi.fn()} />
    ));

    await user.click(getByRole("button", { name: /オプションを選ぶ$/ }));

    expect(screen.getByRole("heading", { name: "ラーメン" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^大盛り/ })).toBeTruthy();
  });

  it("submits the selected option via onAddItems and closes the sheet", async () => {
    const onAddItems = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { getByRole } = render(() => (
      <MenuList
        groups={makeGroups([itemWithOptions])}
        onAddItems={onAddItems}
      />
    ));

    await user.click(getByRole("button", { name: /オプションを選ぶ$/ }));
    await user.click(screen.getByRole("radio", { name: /^大盛り/ }));
    await user.click(screen.getByRole("button", { name: /を注文する$/ }));

    expect(onAddItems).toHaveBeenCalledWith([
      {
        menu_item_id: "item2",
        quantity: 1,
        option_ids: ["o2"],
        note: null,
      },
    ]);
    await vi.waitFor(() => {
      expect(screen.queryByRole("heading", { name: "ラーメン" })).toBeNull();
    });
  });
});
