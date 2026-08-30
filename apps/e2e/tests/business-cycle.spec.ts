import { expect, type Page, test } from "@playwright/test";
import { ADMIN_ORIGIN, ORDER_ORIGIN, SIGNUP_ORIGIN } from "../origins";

/**
 * The golden path from dev-docs/reference/manual-smoke-test.md, driven through
 * the three SPAs in a real browser.
 *
 * apps/api/src/routes/business-cycle.test.ts already covers this same cycle at
 * the API level, so what this spec is actually here to catch is everything that
 * sits between those endpoints and the user: client-side routing, forms that
 * don't submit, and the cross-app polling that carries one app's write into
 * another app's screen.
 *
 * Two pages stay open on one browser context for exactly that reason — the
 * customer screen must still be mounted when staff act in admin, or the polling
 * assertions would only be re-reading a fresh page load.
 *
 * It runs as one spec, matching the API test's scope choice; the test.step
 * names are what localize a failure to a stage of the cycle.
 */

const KARAAGE_PRICE = 500;
const KARAAGE_QTY = 2;
const BEER_PRICE = 600;
const ORDER_TOTAL = KARAAGE_PRICE * KARAAGE_QTY + BEER_PRICE; // 1600

/** Adds a menu item through the admin menu form, optionally in a category. */
async function addMenuItem(
  admin: Page,
  item: { name: string; price: number; category?: string },
) {
  // Scoped to the item form because the page also carries a category form
  // whose 「カテゴリ名」 field and 「カテゴリを追加」 button would otherwise
  // collide with the locators below.
  const form = admin
    .locator("form")
    .filter({ has: admin.getByLabel("商品名", { exact: true }) });

  await form.getByLabel("商品名", { exact: true }).fill(item.name);
  await form.getByLabel("価格（円）", { exact: true }).fill(String(item.price));
  if (item.category) {
    // Kobalte composes the trigger's accessible name as label + current
    // value ("カテゴリ -- なし --"), so anchor on the label rather than
    // asking for an exact match.
    await form.getByRole("button", { name: /^カテゴリ/ }).click();
    // The listbox renders in a portal, outside the form.
    await admin.getByRole("option", { name: item.category }).click();
  }
  await form.getByRole("button", { name: "商品を追加" }).click();
  await expect(
    admin.locator("li").filter({ hasText: item.name }),
  ).toBeVisible();
}

test("a store can be registered and taken through order to payment", async ({
  context,
}) => {
  // A unique store per run is what makes a database reset unnecessary: this
  // store starts with an empty menu, no seats and no sales whatever else the
  // local D1 already holds, and store scoping keeps other runs out of view.
  const storeName = `E2E食堂 ${Date.now()}`;
  const email = `e2e-${crypto.randomUUID()}@test.internal`;

  const admin = await context.newPage();

  await test.step("1. register a store and verify the Magic Link", async () => {
    await admin.goto(SIGNUP_ORIGIN);
    await admin.getByLabel("店舗名").fill(storeName);
    await admin.getByLabel("メールアドレス").fill(email);
    await admin.getByRole("button", { name: "申し込む" }).click();

    await expect(
      admin.getByRole("heading", { name: "メールをご確認ください" }),
    ).toBeVisible();
    // The [DEV] link stands in for the emailed one (ENVIRONMENT=development).
    await admin.getByRole("link", { name: "このリンクで直接確認する" }).click();
  });

  await test.step("2. land in admin as the verified owner", async () => {
    // Verification hops signup → API → admin across three origins; arriving
    // logged in is what proves the session cookie survived that.
    await admin.waitForURL(`${ADMIN_ORIGIN}/`);
    await expect(admin.getByRole("heading", { name: storeName })).toBeVisible();
  });

  await test.step("3. set up the menu", async () => {
    await admin.getByRole("link", { name: "メニュー管理" }).click();

    await admin.getByLabel("カテゴリ名").fill("フード");
    await admin.getByRole("button", { name: "カテゴリを追加" }).click();
    await expect(
      admin.locator("li").filter({ hasText: "フード" }),
    ).toBeVisible();

    await addMenuItem(admin, {
      name: "唐揚げ",
      price: KARAAGE_PRICE,
      category: "フード",
    });
    // Left uncategorized on purpose — the customer menu has to group it under
    // 「その他」 rather than drop it.
    await addMenuItem(admin, { name: "ビール", price: BEER_PRICE });
  });

  let orderUrl = "";

  await test.step("4. issue a seat and its QR link", async () => {
    await admin.getByRole("link", { name: "← 管理トップ" }).click();
    await admin.getByRole("link", { name: "座席管理・QR 発行" }).click();

    await admin.getByLabel("座席名").fill("テーブル1");
    await admin.getByRole("button", { name: "座席を追加" }).click();

    const seatRow = admin.locator("li").filter({ hasText: "テーブル1" });
    await expect(
      seatRow.getByRole("img", { name: "QR テーブル1" }),
    ).toBeVisible();

    const href = await seatRow.getByRole("link").getAttribute("href");
    // Relative here would mean VITE_ORDER_BASE was missing from the admin dev
    // server, which points the printed QR at the admin app instead.
    expect(href).toContain(ORDER_ORIGIN);
    orderUrl = href ?? "";
  });

  const customer = await context.newPage();

  await test.step("5. the customer orders from the seat link", async () => {
    await customer.goto(orderUrl);
    await expect(
      customer.getByRole("heading", { name: "テーブル1" }),
    ).toBeVisible();
    await expect(
      customer.getByRole("heading", { name: "フード", exact: true }),
    ).toBeVisible();
    await expect(
      customer.getByRole("heading", { name: "その他", exact: true }),
    ).toBeVisible();

    await customer
      .getByRole("button", { name: "唐揚げの数量を増やす" })
      .click();
    await customer.getByRole("button", { name: "唐揚げを注文する" }).click();
    await expect(customer.getByText("注文しました！")).toBeVisible();

    await customer.getByRole("button", { name: "ビールを注文する" }).click();

    const summary = customer
      .locator("section")
      .filter({ hasText: "ご注文内容" });
    await expect(summary.getByText("唐揚げ")).toBeVisible();
    await expect(summary.getByText("ビール")).toBeVisible();
    await expect(summary).toContainText(`¥${ORDER_TOTAL.toLocaleString()}`);
  });

  await test.step("6. the order reaches the admin board and is served", async () => {
    await admin.getByRole("link", { name: "← 管理トップ" }).click();
    await admin.getByRole("link", { name: "注文確認・提供管理" }).click();

    // Arrives on the board's own 5s poll, not on a reload.
    const orderCard = admin.locator("article").filter({ hasText: "テーブル1" });
    await expect(orderCard).toBeVisible();
    await expect(orderCard.getByText("新規注文")).toBeVisible();
    await expect(orderCard).toContainText(`¥${ORDER_TOTAL.toLocaleString()}`);

    const serveButtons = orderCard.getByRole("button", { name: "提供済み" });
    await expect(serveButtons).toHaveCount(2);
    // Serving re-renders the card, so re-resolve rather than reusing indexes.
    await serveButtons.first().click();
    await expect(
      orderCard.getByRole("button", { name: "提供済み" }),
    ).toHaveCount(1);
    await orderCard.getByRole("button", { name: "提供済み" }).click();
    await expect(
      orderCard.getByRole("button", { name: "提供取消" }),
    ).toHaveCount(2);
  });

  await test.step("7. the customer screen picks up the served status", async () => {
    // The whole point of the cross-app check: this page was never reloaded.
    const summary = customer
      .locator("section")
      .filter({ hasText: "ご注文内容" });
    await expect(summary.getByText("提供済み")).toHaveCount(2);
  });

  await test.step("8. the customer requests the bill", async () => {
    await customer.getByRole("button", { name: "会計をお願いする" }).click();
    await expect(
      customer.getByText("会計をお待ちください。スタッフが参ります。"),
    ).toBeVisible();
  });

  await test.step("9. staff take a cash payment", async () => {
    await admin.getByRole("link", { name: "← 管理トップ" }).click();
    await admin.getByRole("link", { name: "会計・レジ" }).click();

    const checkoutCard = admin
      .locator("article")
      .filter({ hasText: "テーブル1" });
    await expect(checkoutCard).toBeVisible();
    await expect(checkoutCard.getByText("会計要求中")).toBeVisible();
    await expect(checkoutCard).toContainText(
      `¥${ORDER_TOTAL.toLocaleString()}`,
    );

    await checkoutCard.getByRole("button", { name: "現金" }).click();
    await checkoutCard.getByRole("button", { name: "会計完了" }).click();
    await expect(admin.getByText("会計待ちの伝票はありません")).toBeVisible();
  });

  await test.step("10. the customer sees the paid confirmation", async () => {
    await expect(
      customer.getByText("お支払いが完了しました。ありがとうございました。"),
    ).toBeVisible();
    await expect(
      customer.getByRole("link", { name: "レシートを表示" }),
    ).toBeVisible();
  });

  await test.step("11. the sale lands in the report", async () => {
    await admin.getByRole("link", { name: "← 管理トップ" }).click();
    await admin.getByRole("link", { name: "レポート" }).click();

    const ranking = admin
      .locator("section")
      .filter({ hasText: "商品ランキング" });
    await expect(ranking.getByRole("row", { name: /唐揚げ/ })).toContainText(
      `¥${(KARAAGE_PRICE * KARAAGE_QTY).toLocaleString()}`,
    );
    await expect(ranking.getByRole("row", { name: /ビール/ })).toContainText(
      `¥${BEER_PRICE.toLocaleString()}`,
    );
  });
});
