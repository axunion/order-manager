# 技術アーキテクチャ

## 1. 技術スタック概要

| レイヤー | 技術 | 役割 |
|---|---|---|
| **ホスティング** | Cloudflare Workers | エッジでのサーバーサイドレンダリング（SSR） |
| **データベース** | Cloudflare D1 (SQLite) | マルチテナントのデータ永続化 |
| **フレームワーク** | Astro 6 (SSR モード) | ページルーティング・HTML 生成。`@astrojs/cloudflare` アダプタ使用 |
| **UI（インタラクティブ）** | SolidJS | 管理画面・注文画面などリアクティブな部分。Astro Islands として配置 |
| **API** | Hono + `@hono/zod-validator` | Astro の API ルートを Hono で構成。型安全なルーティング |
| **バリデーション** | Zod | リクエスト・レスポンスの型検証 |
| **ORM** | Drizzle ORM | Cloudflare D1 用の型安全なクエリビルダ |
| **テスト** | Vitest (2 プロジェクト) | node プロジェクト（happy-dom）: ユニット・コンポーネントテスト。workers プロジェクト（@cloudflare/vitest-pool-workers）: API 結合テスト |
| **Lint / Format** | Biome | コードスタイルの統一 |
| **CSS** | CSS Modules + lightningcss | コンポーネント共置スタイル・高速変換・自動プレフィックス |
| **パッケージマネージャ** | pnpm | 高速な依存関係管理 |

設定ファイルの参照:
- スタック: `package.json`
- Astro 設定: `astro.config.mjs`
- ORM 設定: `drizzle.config.ts`（スキーマパス: `./src/db/schema.ts`）
- Cloudflare Workers 設定: `wrangler.jsonc`

---

## 2. ディレクトリ構成

```
src/
├── pages/                   # Astro のファイルベースルーティング
│   ├── index.astro          # (リダイレクト用 or ランディング)
│   ├── register.astro       # ① 申込み画面
│   ├── admin/
│   │   ├── index.astro      # ② 店舗管理画面（ダッシュボード）
│   │   ├── menu.astro       # ② メニュー管理
│   │   ├── seats.astro      # ② 座席・QR 管理
│   │   └── checkout.astro   # ④ 会計・レジ画面
│   ├── order/
│   │   └── [seatToken].astro  # ③ 顧客注文画面（席 QR から開く）
│   └── api/
│       └── [...path].ts     # 単一キャッチオール → src/lib/api/index.ts の Hono app に委譲
│
├── components/              # Astro / SolidJS コンポーネント
│   ├── admin/               # 管理画面専用 SolidJS コンポーネント
│   │   ├── MenuManager.tsx
│   │   ├── SeatManager.tsx
│   │   ├── OrderBoard.tsx   # リアルタイム注文一覧
│   │   └── CheckoutPanel.tsx
│   ├── order/               # 顧客注文画面専用（各 .tsx に .module.css を共置）
│   │   ├── OrderScreen.tsx + OrderScreen.module.css
│   │   ├── MenuList.tsx + MenuList.module.css
│   │   └── OrderSummary.tsx + OrderSummary.module.css
│   ├── register/            # 申込み画面専用
│   │   └── RegisterForm.tsx + RegisterForm.module.css
│   └── ui/                  # 共通 UI 部品（Button / Field / Card）
│
├── db/
│   ├── schema.ts            # Drizzle スキーマ定義（D1/SQLite）
│   └── client.ts            # D1 への接続ヘルパー
│
├── lib/
│   ├── api/                 # Hono アプリ（ルーター定義）
│   │   ├── stores.ts
│   │   ├── menu.ts
│   │   ├── seats.ts
│   │   ├── orders.ts
│   │   └── payments.ts
│   ├── auth.ts              # 簡易トークン検証
│   ├── qr.ts                # QR コードトークン生成・検証
│   └── notification/        # 注文通知の抽象層（将来の WebSocket 移行に対応）
│       ├── index.ts         # インターフェース定義
│       └── polling.ts       # ポーリング実装
│
├── styles/
│   ├── tokens.css           # デザイントークン（CSS 変数・単一の真実）
│   └── global.css           # グローバルベース（リセット・body）
└── env.d.ts                 # 型定義（Cloudflare Workers 型）
```

---

## 3. スタイリング方針

### 採用構成

| 技術 | 役割 |
|---|---|
| **CSS Modules** (`.module.css`) | コンポーネントとスタイルを同ディレクトリに共置。スコープ付きクラス名でコンフリクトを防ぐ |
| **lightningcss** | Vite の CSS トランスフォーマとして動作。CSS nesting・自動プレフィックス・高速ミニファイ |
| **`src/styles/tokens.css`** | 全デザイン値の単一の真実。CSS カスタムプロパティ（`--color-*`・`--space-*` 等）として定義 |
| **`src/styles/global.css`** | `tokens.css` を import してグローバルリセット・body スタイルを適用 |
| **`src/components/ui/`** | `Button` / `Field` / `Card` など再利用可能な共通コンポーネント。SolidJS `.tsx` + 共置 `.module.css` |

### ルール

- **生の色・px・rem 値は `tokens.css` の `:root` にのみ書く。** 他のすべての CSS ファイルは `var(--...)` でトークンを参照する。
- CSS Modules ファイル内では `var(--color-primary)` などのトークン参照のみ許可。hex コードや数値の直書きは禁止。
- SolidJS コンポーネント (`.tsx`) は同ディレクトリに `.module.css` を持ち、`import styles from './Foo.module.css'` → `class={styles.foo}` 形式で参照する。
- `.astro` ページが持つ `<style>` ブロックはページシェル（ヘッダー・レイアウト）のみを対象とし、コンポーネント固有のスタイルは `.module.css` に置く。

### CSS Modules 移行ステータス

| ファイル / コンポーネント | 状態 |
|---|---|
| `src/styles/tokens.css` + `global.css` | ✅ 新規作成済み |
| `src/layouts/Layout.astro` | ✅ global.css を読み込む形に整備済み |
| `src/components/ui/` (Button / Field / Card) | ✅ 新規作成済み |
| `register.astro` + `RegisterForm.tsx` | ✅ CSS Modules 移行済み |
| `order/[seatToken].astro` + OrderScreen / MenuList / OrderSummary | ✅ CSS Modules 移行済み |
| `admin/index.astro` | ⬜ 旧 `<style>` ブロックのまま |
| `admin/orders.astro` + `OrderBoard.tsx` | ⬜ 旧 `<style>` ブロックのまま |
| `admin/menu.astro` + `MenuManager.tsx` | ⬜ 旧 `<style>` ブロックのまま |
| `admin/seats.astro` + `SeatManager.tsx` | ⬜ 旧 `<style>` ブロックのまま |
| `admin/checkout.astro` + `CheckoutPanel.tsx` | ⬜ 旧 `<style>` ブロックのまま |

移行手順と完了基準は `docs/roadmap.md` の「スタイリング基盤 Follow-up」節を参照。

### Phase 3 テーマ対応の布石

- プライマリカラーは `--color-primary` 系のトークンに集約済み。
- Phase 3 で `stores.theme_color` を取得後、`<html style="--color-primary: ...">` のようなインラインスタイルで上書きするだけでテーマが反映される設計。

---

## 4. マルチテナント設計

### 基本方針

- **1 店舗 = `stores` テーブルの 1 レコード**
- メニュー・座席・注文などすべてのデータが `store_id` を持ち、クエリ時に必ず `WHERE store_id = ?` でフィルタリングすることでテナント分離を実現
- テナント識別は URL パスではなく、**リクエストに含まれるトークン**で行う（後述）

### テナント識別フロー

```
管理画面アクセス時:
  Cookie("access_token") → stores テーブルで照合 → store_id を確定 → 以降すべての DB クエリに store_id を付与

顧客注文画面アクセス時:
  URL パラメータ(:seatToken) → seats テーブルで照合 → seat.store_id を確定 → 以降すべての DB クエリに store_id を付与
```

---

## 4. 画面とルーティングの対応

| 画面 | URL | アクセス制御 | 備考 |
|---|---|---|---|
| ① 申込み画面 | `/register` | 公開 | 店舗登録フォーム |
| ② 管理画面 | `/admin` | 簡易トークン（Cookie） | SSR でトークン検証 |
| ③ 顧客注文画面 | `/order/:seatToken` | QR トークン（URL パラメータ） | `seatToken` で席と店舗を識別 |
| ④ 会計・レジ画面 | `/admin/checkout` | 簡易トークン（Cookie） | 管理画面と同一の保護 |

### 管理画面の保護フロー（Astro SSR ミドルウェア）

```
1. `/admin` へのリクエスト
2. Cookie から access_token を取得
3. `stores` テーブルで access_token を検索
4. 存在しない → `/register` にリダイレクト
5. 存在する → store_id をページに渡して表示
```

---

## 5. リアルタイム注文通知（両論併記）

管理画面が「新規注文をリアルタイムで受け取る」仕組みについて、2 案を検討する。初期フェーズでの採用は **案 A（ポーリング）**を推奨とし、将来的な案 B への移行を可能にする設計とする。

### 案 A: ポーリング（初期フェーズ推奨）

```
管理画面（SolidJS）
  → setInterval で 5 秒ごとに GET /api/orders?since=<timestamp> を叩く
  → 新規の order_items を取得して画面更新
```

| 観点 | 評価 |
|---|---|
| 実装コスト | 低 |
| インフラ追加 | なし（D1 のみ） |
| 即時性 | 最大 5 秒の遅延 |
| スケーラビリティ | Workers のリクエスト数に依存するが飲食店規模なら問題なし |

**移行の用意**: 通知ロジックを `src/lib/notification/` に抽象化し、管理画面 SolidJS コンポーネントはインターフェース経由で使用。将来の差し替えをコンポーネント内コードの変更なしに行えるようにする。

### 案 B: WebSocket + Cloudflare Durable Objects（将来フェーズ）

```
各店舗につき 1 つの Durable Object（ルーム）
  → 顧客が注文 → API が DO にメッセージ送信
  → DO から管理画面の WebSocket クライアントへ push
```

| 観点 | 評価 |
|---|---|
| 実装コスト | 高（Durable Objects の別途設定・料金が発生） |
| インフラ追加 | Cloudflare Durable Objects（`wrangler.jsonc` に追記が必要） |
| 即時性 | ほぼ即時（< 100ms） |
| スケーラビリティ | 高（DO がコネクションを管理） |

### 移行トレードオフ比較

| | 案 A ポーリング | 案 B WebSocket + DO |
|---|---|---|
| **即時性** | ～5 秒 | ほぼ即時 |
| **実装工数** | 小 | 大 |
| **追加コスト** | なし | DO の利用料 |
| **Cloudflare D1 のみで完結** | ✅ | ❌（DO が必要） |
| **初期フェーズ適性** | ✅ 推奨 | ❌ 過剰 |
| **将来移行性** | 通知層の抽象化で対応 | 本格実装 |

---

## 6. 認証設計

### 初期フェーズ: 簡易トークン

| 用途 | トークン | 保存場所 |
|---|---|---|
| 管理画面ログイン | `stores.access_token`（UUID v4） | HTTP-only Cookie |
| 顧客注文画面の席識別 | `seats.qr_token`（UUID v4） | URL パラメータ（QR コードに埋め込み） |

- `access_token` は申込み完了時に自動生成。スタッフはトークン入りの URL をブックマークして管理画面にアクセスする。
- セキュリティリスク: URL 流出によるなりすまし。飲食店の業務用途では許容範囲と判断（MVP 段階）。

### 将来フェーズ: 本格認証への拡張ポイント

`stores` テーブルに `email` / `password_hash` カラムを追加し、ログインフォームとセッション管理を追加することで本格認証に移行可能。または Cloudflare Access や Magic Link パターンへの置き換えも可能。

---

## 7. API 設計方針

### Hono アプリの構成

Astro の API エンドポイント（`src/pages/api/`）を Hono で実装する。各リソースごとにルータを分割し、`src/lib/api/` に定義する。

```ts
// src/pages/api/[...path].ts — 実装済み
import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { app } from "../../lib/api";

export const ALL: APIRoute = ({ request }) => app.fetch(request, env);
```

単一のキャッチオールファイルを使うことで、新しいリソースを `src/lib/api/` に追加しても
Astro 側のファイルを増やさずに済む。

### レスポンス形式

成功時:
```json
{ "data": { ... } }
```

エラー時:
```json
{ "error": { "code": "NOT_FOUND", "message": "..." } }
```

#### エラーコード一覧

| コード | HTTP | 説明 |
|---|---|---|
| `VALIDATION_ERROR` | 400 | リクエストボディのバリデーション失敗 |
| `UNAUTHORIZED` | 401 | `access_token` クッキーが未設定または無効 |
| `NOT_FOUND` | 404 | リソースが存在しない、または他テナントのリソース（テナント越境防止のため 403 でなく 404 を返す） |
| `CONFLICT` | 409 | 操作が他のデータと競合（例: 過去の注文から参照されている商品の削除） |
| `INTERNAL_ERROR` | 500 | サーバー内部エラー |

### 認証付き API ルータ（`AuthEnv`）

管理画面向け API（`/api/menu/*` など）は `src/lib/api/middleware.ts` の `requireStore` ミドルウェアで保護する。

```ts
// src/lib/api/middleware.ts
export type AuthEnv = { Bindings: Env; Variables: { store: StoreSession } };
export const requireStore = createMiddleware<AuthEnv>(async (c, next) => { ... });

// ルータ側の適用例
export const menuRouter = new Hono<AuthEnv>().use(requireStore).get(...);
```

- `getCookie(c, ACCESS_TOKEN_COOKIE)` でクッキーを読み、`getStoreByAccessToken` で store を解決
- 成功時は `c.var.store.id` でテナント ID を取得し、全 DB クエリに `store_id` フィルタを付与

### メニュー管理 API（Step 3 実装済み）

| メソッド | URL | 用途 |
|---|---|---|
| GET | `/api/menu/categories` | カテゴリ一覧（`sort_order` 昇順） |
| POST | `/api/menu/categories` | カテゴリ作成 → 201 |
| PATCH | `/api/menu/categories/:id` | カテゴリ更新 → 200 / 404 |
| DELETE | `/api/menu/categories/:id` | カテゴリ削除 → 200 / 404 |
| GET | `/api/menu/items` | 商品一覧（`sort_order` 昇順） |
| POST | `/api/menu/items` | 商品作成 → 201 |
| PATCH | `/api/menu/items/:id` | 商品更新 → 200 / 404 |
| DELETE | `/api/menu/items/:id` | 商品削除 → 200 / 404 / 409 |

### 顧客注文 API（Step 5 実装済み）

認証: `:seatToken` URL パラメータ（`seats.qr_token`）。`requireSeat` ミドルウェアが seat + store_id を解決し、全 DB クエリに `store_id` フィルタを付与する。

| メソッド | URL | 用途 |
|---|---|---|
| GET | `/api/order/:seatToken` | ブートストラップ（席情報・メニュー・アクティブ注文）→ 200 / 404 |
| POST | `/api/order/:seatToken/items` | 注文追加（初回は伝票を遅延作成）→ 201 / 400 / 404 / 409 |
| PATCH | `/api/order/:seatToken/request-payment` | 会計要求（`open → payment_requested`）→ 200 / 404 / 409 |

---

## 8. デプロイ構成

### 8.1 コマンド早見表

| 目的 | コマンド | 実行場所 |
|---|---|---|
| ローカル開発 | `pnpm dev` | ローカル |
| ビルド確認 | `pnpm build` | ローカル |
| プレビュー | `pnpm preview` | ローカル |
| **本番デプロイ** | `wrangler deploy` | **CI のみ** |

---

### 8.2 DB マイグレーション戦略

#### ローカル開発

```
スキーマ変更
  → src/db/schema.ts を編集
  → pnpm db:generate          # drizzle-kit generate → drizzle/ に SQL 生成
  → pnpm db:migrate           # wrangler d1 migrations apply order-manager --local
  → pnpm db:studio            # drizzle-kit studio（ブラウザで D1 ローカルを閲覧・編集）
```

- `pnpm db:migrate` は **必ず `--local` フラグ付き**で実行される（`package.json` で固定済み）
- ローカル D1 の実体は `.wrangler/state/v3/d1/`（`.gitignore` 対象）

#### 本番環境（GitHub Actions 経由のみ）

```
main ブランチへ push / PR マージ
  → GitHub Actions ワークフロー
      1. wrangler d1 migrations apply order-manager --remote   # D1 マイグレーション
      2. wrangler deploy                                        # Workers デプロイ
```

**ルール**:
- ローカルから `--remote` フラグを使ったマイグレーション、および `wrangler deploy` は禁止
- Cloudflare の本番認証情報（`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`）は **GitHub Actions シークレットにのみ** 存在し、`.dev.vars` には書かない
- `drizzle.config.ts` の `d1-http` ドライバは意図的にコメントアウト（ローカルから本番 D1 に直接接続する手段を塞いでいる）

---

### 8.3 環境変数・シークレット管理

| 変数 | ローカル（`.dev.vars`） | 本番（Cloudflare シークレット / GitHub Actions）|
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | **書かない** | GitHub Actions Secret |
| `CLOUDFLARE_ACCOUNT_ID` | **書かない** | GitHub Actions Secret |
| アプリ固有のシークレット | `.dev.vars`（gitignore 済み） | Cloudflare Workers シークレット |

> `.dev.vars` は `.gitignore` に含まれているが、本番認証情報を書く習慣自体を禁止する。

---

### 8.4 CI/CD ワークフロー（リリース前に追加予定）

リリース前に `.github/workflows/deploy.yml` を追加する。想定フロー:

```yaml
# 概念的なフロー（実装はリリース前フェーズで追加）
on:
  push:
    branches: [main]

jobs:
  deploy:
    steps:
      - pnpm check          # lint + 型チェック
      - pnpm test           # ユニット・コンポーネントテスト
      - pnpm build          # Astro ビルド
      - wrangler d1 migrations apply order-manager --remote   # DB マイグレーション
      - wrangler deploy     # Workers デプロイ
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

マイグレーションはデプロイより先に実行し、ロールバック時は古いコードが新スキーマで動作できることを事前に確認する（後方互換マイグレーション戦略）。
