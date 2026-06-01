# データモデル設計

## 1. ER 概要図

```
stores
  │
  ├── menu_categories ──── menu_items
  │
  ├── seats
  │     │
  │     └── orders ──── order_items ──── menu_items（スナップショット参照）
  │                 │
  │                 └── payments
  │
  └── （将来）option_groups ── options
                                    │
                              order_item_options ── order_items
```

---

## 2. テーブル定義

### `stores`（店舗）

| カラム | 型 | 説明 |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `name` | TEXT | 店舗名 |
| `slug` | TEXT UNIQUE | URL フレンドリーな識別子（将来の URL 表示用）。生成ルール: `slugify(店舗名) + "-" + 5 文字ランダム英数字`（例: `my-cafe-x4k2p`）。日本語のみの場合は `"store"` にフォールバック |
| `access_token` | TEXT UNIQUE | 管理画面保護用トークン（UUID v4） |
| `created_at` | INTEGER (Unix ms) | 登録日時 |
| ~~`logo_url`~~ | TEXT（将来追加） | 店舗ロゴの URL |
| ~~`theme_color`~~ | TEXT（将来追加） | テーマカラー（例: `#FF5733`） |

```sql
-- Drizzle スキーマのイメージ
stores: id, name, slug, access_token, created_at
```

---

### `menu_categories`（メニューカテゴリ）

| カラム | 型 | 説明 |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `store_id` | TEXT | FK → stores.id |
| `name` | TEXT | カテゴリ名（例: ドリンク、フード） |
| `sort_order` | INTEGER | 表示順 |

- 初期はカテゴリなしでも商品登録できるよう `menu_items.category_id` は nullable とする
- 将来のメニュー管理 UI 整備に向けて当初から用意する

---

### `menu_items`（メニュー商品）

| カラム | 型 | 説明 |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `store_id` | TEXT | FK → stores.id（テナント分離） |
| `category_id` | TEXT \| NULL | FK → menu_categories.id |
| `name` | TEXT | 商品名 |
| `price` | INTEGER | 価格（円、税込） |
| `is_available` | INTEGER (0/1) | 提供中かどうか（品切れ管理） |
| `sort_order` | INTEGER | 顧客注文画面での表示順 |
| ~~`description`~~ | TEXT（将来追加） | 商品説明文 |
| ~~`image_url`~~ | TEXT（将来追加） | 商品画像 URL |

---

### `seats`（座席）

| カラム | 型 | 説明 |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `store_id` | TEXT | FK → stores.id |
| `name` | TEXT | 席の名前（例: テーブル 1、カウンター A） |
| `qr_token` | TEXT UNIQUE | QR コードに埋め込む一意トークン（UUID v4） |
| `created_at` | INTEGER (Unix ms) | 作成日時 |

- QR コードの URL: `/order/:qrToken`
- 席の削除時は、進行中の `orders` が存在しないことを確認してから削除する

---

### `orders`（伝票 / 会計セッション）

| カラム | 型 | 説明 |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `store_id` | TEXT | FK → stores.id（テナント分離） |
| `seat_id` | TEXT | FK → seats.id |
| `status` | TEXT | 伝票の状態（下記参照） |
| `created_at` | INTEGER (Unix ms) | 開票日時 |
| `closed_at` | INTEGER \| NULL | 会計完了日時 |

#### `orders.status` の状態遷移

```
open ──[来客が「会計をお願いする」]──→ payment_requested ──[スタッフが「会計完了」]──→ paid
```

| 値 | 意味 |
|---|---|
| `open` | 注文受付中（伝票オープン） |
| `payment_requested` | 来店客が会計を要求した状態 |
| `paid` | 会計完了（伝票クローズ） |

- 1 つの座席に対して同時に存在できる `status = open` または `status = payment_requested` の伝票は 1 件のみ
- 来店客が QR コードにアクセスした際、アクティブな伝票（`open` or `payment_requested`）がなければ新規作成する

---

### `order_items`（注文明細）

| カラム | 型 | 説明 |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `store_id` | TEXT | FK → stores.id（**テナント分離用**・非正規化） |
| `order_id` | TEXT | FK → orders.id |
| `menu_item_id` | TEXT | FK → menu_items.id（参照用） |
| `name_snapshot` | TEXT | **注文時点の商品名（スナップショット）** |
| `unit_price_snapshot` | INTEGER | **注文時点の単価（スナップショット）** |
| `quantity` | INTEGER | 注文数量（1 以上）|
| `status` | TEXT | 明細の状態（下記参照） |
| `created_at` | INTEGER (Unix ms) | 注文日時 |

> **設計メモ**: `store_id` は `orders.store_id` と常に一致する冗長カラムだが、すべての DB クエリに `store_id` フィルタを必須とするマルチテナント分離ルールを `order_items` 単体で満たすために保持する。

#### スナップショット保存の理由

`menu_items.name` や `price` は後から変更される可能性がある。注文時点の値を `order_items` 自身が保持することで、**後からメニューを変更しても過去の伝票の合計金額が変わらない**ことを保証する。

#### `order_items.status` の状態遷移

```
ordered ──[スタッフが提供済みにマーク]──→ served
```

| 値 | 意味 |
|---|---|
| `ordered` | 注文済み・未提供 |
| `served` | 提供済み |

---

### `payments`（会計）

| カラム | 型 | 説明 |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `store_id` | TEXT | FK → stores.id（**テナント分離用**・非正規化） |
| `order_id` | TEXT UNIQUE | FK → orders.id |
| `total_amount` | INTEGER | 合計金額（円、0 以上） |
| `method` | TEXT | 支払い方法（Phase 1: `cash` / Phase 4: `card`, `qr`） |
| `paid_at` | INTEGER (Unix ms) | 会計完了日時 |

- `total_amount` は会計時点での `order_items` の `unit_price_snapshot × quantity` の合計を計算して保存する
- `store_id` は `order_items` と同じ理由で保持する非正規化カラム

---

## 3. 業務サイクルとデータ遷移の対応

### ステップ 3: 来店客が注文する

```sql
-- アクティブな伝票を検索（なければ INSERT）
SELECT * FROM orders WHERE seat_id = :seatId AND status IN ('open', 'payment_requested');

-- 注文明細の追加（store_id は非正規化して保持）
INSERT INTO order_items (id, store_id, order_id, menu_item_id, name_snapshot, unit_price_snapshot, quantity, status, created_at)
SELECT :id, :storeId, :orderId, mi.id, mi.name, mi.price, :qty, 'ordered', :now
FROM menu_items mi WHERE mi.id = :menuItemId AND mi.store_id = :storeId;
```

### ステップ 4: スタッフが提供済みにマーク

```sql
-- store_id で直接フィルタ可能（orders への JOIN 不要）
UPDATE order_items SET status = 'served' WHERE id = :itemId AND store_id = :storeId;
```

### ステップ 5a: 来店客が会計を要求

```sql
UPDATE orders SET status = 'payment_requested' WHERE id = :orderId AND status = 'open';
```

### ステップ 5b: スタッフが会計を完了

```sql
-- 合計金額を計算
SELECT SUM(unit_price_snapshot * quantity) AS total FROM order_items WHERE order_id = :orderId;

-- 会計レコードを作成（store_id は非正規化して保持）
INSERT INTO payments (id, store_id, order_id, total_amount, method, paid_at) VALUES (...);

-- 伝票をクローズ
UPDATE orders SET status = 'paid', closed_at = :now WHERE id = :orderId;
```

---

## 4. 将来拡張のための設計メモ

### 4.1 メニューオプション（トッピング・大盛り）

Phase 2 で以下のテーブルを追加予定:

```
option_groups: id, menu_item_id, name, type(single/multi), is_required
options:       id, option_group_id, name, price_delta
order_item_options: id, order_item_id, option_id, name_snapshot, price_delta_snapshot
```

`order_items` の合計金額は `unit_price_snapshot + SUM(order_item_options.price_delta_snapshot)` で計算する。

### 4.2 オンライン決済

`payments.method` を `card` / `qr` に拡張し、`payments.external_payment_id`（PSP のトランザクション ID）カラムを追加する。決済ロジックは `src/lib/payment/` に集約する。

### 4.3 インデックス設計の指針

パフォーマンスに影響するクエリのために以下のインデックスを初期から設定する:

```sql
CREATE INDEX idx_menu_items_store   ON menu_items(store_id);
CREATE INDEX idx_seats_store        ON seats(store_id);
CREATE INDEX idx_orders_seat        ON orders(seat_id, status);
CREATE INDEX idx_orders_store       ON orders(store_id, status);
CREATE INDEX idx_order_items_order  ON order_items(order_id, status);
CREATE INDEX idx_order_items_store  ON order_items(store_id);
```
