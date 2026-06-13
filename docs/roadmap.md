# 開発ロードマップ

## フェーズ一覧

| フェーズ | テーマ | 前提 |
|---|---|---|
| **Phase 1** | MVP（一連業務サイクルの完成） | なし |
| **オンボーディング刷新** | Magic Link 認証・セッション管理・メール基盤 | Phase 1 完了 |
| **Phase 2** | メニューオプション（トッピング・大盛り） | Phase 1 完了 |
| **Phase 3** | 店舗テーマ（ロゴ・カラー） | Phase 1 完了 |
| **Phase 4** | オンライン決済・WebSocket | Phase 1〜3 完了 |

---

## Phase 1: MVP

**目標**: 申込みから注文・会計完了までの業務サイクルを最小限の実装で完全に動作させる。

### 実装内容

- 4 画面すべて（申込み・管理・注文・会計）
- ポーリング方式によるリアルタイム注文通知
- 簡易トークン認証（`access_token` の Cookie 管理）—— **オンボーディング刷新フェーズで Magic Link + session 方式に置き換える**

### Phase 1 の実装着手順

実装は依存関係の順番に従って進める。

```
Step 1. DB スキーマ定義（src/db/schema.ts）
        └─ Drizzle で stores / menu_categories / menu_items / seats / orders / order_items / payments を定義
        └─ drizzle-kit generate でマイグレーション SQL 生成
        └─ D1 ローカル環境への適用確認

Step 2. ① 申込み画面（/register）
        └─ 店舗名入力フォーム → POST /api/stores
        └─ 完了後に access_token を Cookie にセット → /admin にリダイレクト

Step 3. ② 管理画面 - メニュー管理（/admin/menu）
        └─ メニューカテゴリ CRUD
        └─ メニュー商品 CRUD（商品名・価格・提供状態）

Step 4. ② 管理画面 - 座席管理・QR 発行（/admin/seats）
        └─ 座席の追加・削除
        └─ qr_token を URL に埋め込んだ QR コード表示

Step 5. ③ 顧客注文画面（/order/:seatToken）
        └─ メニュー一覧表示
        └─ 商品選択・数量指定・注文送信（POST /api/orders/items）
        └─ 自分の注文履歴と合計金額の表示
        └─ 「会計をお願いする」ボタン（PATCH /api/orders/:id/request-payment）

Step 6. ② 管理画面 - 注文確認・提供管理（/admin/orders）
        └─ ポーリングで新規注文を取得・表示（GET /api/admin/orders?since=）
        └─ 明細ごとに「提供済み」マーク（PATCH /api/admin/orders/items/:id/serve）

Step 7. ④ 会計・レジ画面（/admin/checkout）
        └─ 会計要求中の伝票一覧表示
        └─ 伝票の注文明細と合計金額の表示
        └─ 「会計完了」ボタン（POST /api/payments）

Step 8. 業務サイクルの結合テスト
        └─ Step 1〜7 が一周つながることを確認
        └─ マルチテナント分離のテスト（複数店舗でデータが混在しないか）
```

### Phase 1 の完了基準

- [x] 申込みから会計完了まで一通りの業務サイクルが動作する
- [x] 異なる 2 店舗のデータが互いに見えないこと（マルチテナント分離）
- [x] 顧客注文画面がモバイルで正常に表示・操作できること（CSS Modules + トークンで整備済み）
- [x] ポーリングで注文が管理画面に届くこと（最大 5 秒以内）
- [x] `pnpm check` と `pnpm test` が通ること

---

## オンボーディング刷新（Magic Link 認証・セッション管理）

**目標**: 現行の「店舗名のみで即時登録・`access_token` URL ブックマーク」方式を廃止し、メールアドレス認証と proper なセッション管理を導入する。

詳細設計は `docs/onboarding.md` を参照。

### 実装内容

- `stores` テーブルに `email`・`status`・`activated_at` を追加、`access_token` を廃止
- `magic_link_tokens` テーブルの追加（短命・一回限りの認証トークン）
- `sessions` テーブルの追加（30 日間のセッション管理）
- `/api/stores`（申込み）・`/api/auth/verify`・`/api/auth/login`・`/api/auth/logout` の実装（`src/lib/api/auth.ts`）
- `src/lib/email.ts` の追加（Resend 経由のメール送信）
- `src/lib/auth.ts` の `getStoreBySession` への置き換え（`SESSION_TOKEN_COOKIE` 定数）
- Astro middleware・Hono `requireStore` の session_token 参照への切り替え
- `/login.astro`・`/register/check-email.astro` ページの追加
- `scripts/seed-dev.ts` の追加（ローカル開発用シードアカウント・本番不適用ガード付き）

### 完了基準

- [ ] 申込み → Magic Link メール → 認証 → 管理画面入室の一連フローが動作する
- [ ] ログイン（再訪）フローが動作する
- [ ] ログアウトでセッションが削除される
- [ ] `stores.status = "pending"` の店舗は `/admin` にアクセスできないこと
- [ ] 期限切れ・使用済みトークンが拒否されること
- [ ] `pnpm seed:dev` でシードアカウントを使って管理画面にアクセスできること（ローカルのみ）
- [ ] `pnpm check` と `pnpm test` が通ること

---

## スタイリング基盤 Follow-up（Phase 2 着手前に完了推奨）

**目標**: CSS Modules + デザイントークンへの移行を admin 画面まで完了させ、ハードコードされた色を全廃する。

### 背景と現状

前セッションでスタイリング基盤（lightningcss・`src/styles/tokens.css`・CSS Modules）を整備し、2 画面で参照実装を完了した。

| 画面ファイル | SolidJS コンポーネント | 状態 |
|---|---|---|
| `src/pages/register.astro` | `RegisterForm.tsx + .module.css` | ✅ 完了 |
| `src/pages/order/[seatToken].astro` | `OrderScreen / MenuList / OrderSummary + .module.css` | ✅ 完了 |
| `src/pages/admin/index.astro` | なし（純 Astro） | ✅ 完了 |
| `src/pages/admin/orders.astro` | `components/admin/OrderBoard.tsx` | ✅ 完了 |
| `src/pages/admin/menu.astro` | `components/admin/MenuManager.tsx` | ✅ 完了 |
| `src/pages/admin/seats.astro` | `components/admin/SeatManager.tsx` | ✅ 完了 |
| `src/pages/admin/checkout.astro` | `components/admin/CheckoutPanel.tsx` | ✅ 完了 |

### 移行パターン（完了済み画面を参考にすること）

1. **`.astro` ページの `<style>` を読む** — どのクラスが SolidJS コンポーネント側で使われているか確認する
2. **`.module.css` を `components/admin/` に新規作成** — すべての値を `var(--...)` トークン参照に置換（`src/styles/tokens.css` を参照）
3. **`.tsx` を更新** — `import styles from './Foo.module.css'` を追加し、`class="foo-bar"` → `class={styles.fooBar}` に置換
4. **`.astro` の `<style>` を縮小** — ページシェル（header / main のレイアウト）のみ残し、コンポーネント固有スタイルは削除。変数はすでに `Layout.astro` 経由でグローバルに読み込まれているので `var(--...)` が使える
5. **`pnpm check && pnpm test`** で確認

共通 UI (`src/components/ui/Button`, `Field`, `Card`) は必要に応じて管理画面でも流用してよい。

### 完了基準

- `src/` 全体で `#6366f1` / `#4f46e5`（旧インディゴ）がゼロ件になること（`grep -r "#6366f1" src/` で確認）
- `pnpm check && pnpm test` が通ること

---

## Kobalte 導入（admin アクセシビリティ強化）

**目標**: admin 画面の `<select>` やダイアログ的 UI を、アクセシブルなヘッドレスコンポーネントに置き換える。

### 完了内容

- [x] `@kobalte/core 0.13.11` インストール
- [x] `src/components/ui/Select.tsx` — Kobalte Select をラップした汎用コンポーネント（`data-*` 属性スタイリング・トークン参照）
- [x] `src/components/ui/ConfirmDialog.tsx` — Kobalte AlertDialog をラップした削除確認ダイアログ（`role="alertdialog"`・ARIA 完備）
- [x] `MenuManager.tsx` — カテゴリ `<select>` を `ui/Select` に置換、カテゴリ/商品の削除を `ConfirmDialog` 経由に変更
- [x] `SeatManager.tsx` — 座席の削除を `ConfirmDialog` 経由に変更
- [x] `pnpm check` と `pnpm test`（node 126 件 + workers 120 件）通過

### 実装メモ

- Kobalte の Presence コンポーネントは happy-dom でアンマウントが非同期になるため、`AlertDialog` は SolidJS の `Show` でラップして即時マウント制御する設計を採用した。
- テスト間の DOM 汚染を防ぐため、`@solidjs/testing-library` の `cleanup` を各テストファイルの `afterEach` で明示的に呼び出すパターンを標準化した。

---

## Phase 2: メニューオプション（トッピング・大盛り）

**目標**: メニュー商品にトッピングやサイズなどのカスタマイズオプションを追加できるようにする。

### 実装内容

- `option_groups` / `options` テーブルの追加
- メニュー管理画面にオプション設定 UI を追加
- 顧客注文画面でオプション選択を追加
- `order_item_options` で注文時の選択内容をスナップショット保存
- 合計金額計算に `price_delta` を反映

### 前提

Phase 1 の DB スキーマ設計時点で `order_items` に `option_groups` への外部キーの受け口を残してあること（`data-model.md` 参照）。

---

## Phase 3: 店舗テーマ（ロゴ・カラー）

**目標**: 店舗ごとにロゴ画像とテーマカラーを設定し、顧客注文画面に反映できるようにする。

### 実装内容

- `stores` テーブルに `logo_url` / `theme_color` カラムを追加
- 管理画面にテーマ設定フォームを追加
- 顧客注文画面の CSS 変数をテーマカラーに基づいて動的に設定

### 前提

- 顧客注文画面が Phase 1 から CSS 変数ベースで実装されていること ✅（`src/styles/tokens.css` + CSS Modules で完備済み）
- 画像ストレージ（Cloudflare R2 など）の検討が必要

---

## Phase 4: オンライン決済・WebSocket

**目標**: SaaS としての商用グレードの機能を揃える。

### 実装内容

#### 4a. オンライン決済

- `payments.method` に `card` / `qr` などを追加
- Stripe 等の PSP との連携（`src/lib/payment/` で実装を切り替え）
- 顧客注文画面に決済 UI を追加

#### 4b. WebSocket によるリアルタイム通知

- Cloudflare Durable Objects で店舗ごとの WebSocket ルームを実装
- `src/lib/notification/websocket.ts` を追加し、管理画面の `OrderBoard.tsx` でポーリングから WebSocket に切り替え
- Phase 1 の通知層抽象化が移行コストを最小化する

### 前提

- Phase 1〜3 の完了（Magic Link 認証はオンボーディング刷新フェーズで完了済み）
- Durable Objects の有効化（Cloudflare プランの確認が必要）
- PSP のアカウント契約・API キーの取得

---

## 実装方針の補足

### テスト戦略

| テスト種別 | ツール | 対象 |
|---|---|---|
| ユニットテスト | Vitest | ドメインロジック（合計計算・状態遷移） |
| コンポーネントテスト | Vitest + happy-dom + @solidjs/testing-library | SolidJS コンポーネント |
| 結合テスト | Vitest + Hono テストヘルパー | API エンドポイント |

### コード品質

- `pnpm check`（Biome lint + Astro type check）を CI で必須通過とする
- `lefthook` で pre-commit に `pnpm check` を設定済み（`lefthook.yml` 参照）
