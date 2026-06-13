# オンボーディング設計

店舗オーナーの申込み・メール認証・ログイン・ログアウトに関する設計。

現行の「店舗名 1 フィールドで即時登録・`access_token` URL ブックマーク」方式を廃止し、**Magic Link（パスワードレス）認証**と**セッション管理**を軸にしたフローに刷新する。実装詳細は `docs/architecture.md` 7 節（認証設計）・8 節（メール基盤）と `docs/data-model.md` を参照。

---

## 1. フロー全体図

### 1.1 申込み（初回オンボーディング）

```
オーナーが /register で 店舗名 + メールアドレス を入力
    ↓ POST /api/stores
stores レコードを status = "pending" で作成
magic_link_tokens レコードを purpose = "signup" で作成（有効期限: 15 分、一回限り）
    ↓ メール送信（Resend 経由、src/lib/email.ts）
ブラウザを /register/check-email へリダイレクト（「メールを確認してください」案内）

オーナーがメールの Magic Link をクリック
    ↓ GET /api/auth/verify?token=<token>
トークンを検証（期限・used_at・purpose = "signup"）
stores.status を "active" に更新、activated_at を記録
sessions レコードを作成（有効期限: 30 日）
    ↓ session_token Cookie をセット（HttpOnly; SameSite=Lax; Secure）
/admin へリダイレクト
```

### 1.2 ログイン（再訪）

```
オーナーが /login でメールアドレスを入力
    ↓ POST /api/auth/login
email で stores レコードを検索

（メールの存在有無を漏らさないため、常に「送信済み」レスポンスを返す）

stores が存在する場合、status に応じてメール送信:
  - status = "active"  → purpose = "login"  の Magic Link を発行・送信
  - status = "pending" → purpose = "signup" の Magic Link を再発行・送信
                         （申込み時のメール送信失敗からのリカバリ）
  - status = "suspended" → メール未送信（サイレント）

magic_link_tokens レコードを発行（有効期限: 15 分、一回限り）
    ↓ メール送信

オーナーがメールの Magic Link をクリック
    ↓ GET /api/auth/verify?token=<token>（signup と同じ経路）
sessions レコードを作成、session_token Cookie をセット
/admin へリダイレクト
```

### 1.3 ログアウト

```
POST /api/auth/logout（Cookie から session_token を読む）
    ↓
sessions レコードを削除（他デバイスのセッションは維持）
Cookie をクリア（Max-Age=0）
/login へリダイレクト
```

---

## 2. stores.status 状態遷移

```
[申込み送信]
    ↓ POST /api/stores
  pending ──[メールの Magic Link をクリック]──→ active
                                                    │
                                           （将来: 利用停止）
                                                    ↓
                                               suspended
```

| 値 | 意味 |
|---|---|
| `pending` | メール認証前。管理画面へのアクセス不可 |
| `active` | 認証済み・有効。管理画面にアクセス可能 |
| `suspended` | 利用停止（将来フェーズ） |

> **設計メモ（決済ゲートの差し込み位置）**: 将来 SaaS 利用料の課金を導入する場合、`status = "active"` への更新の直前に決済フローを挟む。具体的には `GET /api/auth/verify` のトークン検証成功後に PSP（例: Stripe）で決済セッションを作成し、決済完了の webhook 受信をもって `status = "active"` に更新する。それまでの中間状態として ~~`pending_payment`~~（将来追加）を予約する。

---

## 3. Magic Link トークン設計

| 項目 | 仕様 |
|---|---|
| **有効期限** | 15 分（`expires_at = now + 15 × 60 × 1000` ms） |
| **一回限り** | 検証時に `used_at` を記録。以降の再利用は `INVALID_TOKEN` エラーで拒否 |
| **purpose 分離** | `signup`（初回申込み）/ `login`（再訪）を区別し、誤用（ログイントークンでサインアップバイパス等）を防ぐ |
| **列挙攻撃対策** | トークン不正・期限切れ・purpose 不一致はすべて同一エラー `INVALID_TOKEN` で返す（400/404 を使い分けない） |
| **再送・上書き** | 同一 `store_id` かつ同一 `purpose` の未使用トークンを DELETE してから新規 INSERT する（古いリンクを無効化。purpose をまたいで削除しない） |

---

## 4. セッション設計

| 項目 | 仕様 |
|---|---|
| **Cookie 名** | `session_token`（`SESSION_TOKEN_COOKIE` 定数） |
| **Cookie 属性** | `HttpOnly; SameSite=Lax; Path=/`（本番のみ `Secure`） |
| **有効期限** | 30 日（`expires_at = now + 30 × 24 × 60 × 60 × 1000` ms） |
| **複数デバイス** | `sessions` テーブル参照のため、1 店舗に複数のアクティブセッションが共存できる |
| **ログアウト** | 該当 session レコードを DELETE。他デバイスのセッションは維持 |
| **検証フロー** | `sessions` から `session_token` で検索 → 期限確認 → `stores.status = "active"` 確認 |

### セッション検証フロー（管理画面アクセス時）

```
Cookie("session_token")
    ↓ なければ → /login にリダイレクト
sessions テーブルで session_token を検索
    ↓ 存在しなければ → /login にリダイレクト
expires_at を確認
    ↓ 期限切れ → session レコード削除 → /login にリダイレクト
stores.status = "active" を確認
    ↓ pending → /register/check-email へ、suspended → エラーページへ
store_id を確定 → 以降すべての DB クエリに store_id を付与
```

---

## 5. 既存認証との関係

| 認証対象 | 変更前 | 変更後 |
|---|---|---|
| 管理画面（店舗スタッフ） | `stores.access_token` HttpOnly Cookie | `sessions.session_token` HttpOnly Cookie |
| 顧客注文画面 | `seats.qr_token` URL パラメータ | **変更なし** |

`src/lib/auth.ts` の `getStoreByAccessToken` は `getStoreBySession` に置き換える。`sessions` テーブルへの JOIN・期限チェック・`stores.status = "active"` チェックを追加する。Astro middleware（`src/middleware.ts`）と Hono `requireStore`（`src/lib/api/middleware.ts`）の Cookie 参照キーは `ACCESS_TOKEN_COOKIE` → `SESSION_TOKEN_COOKIE` に変更する。

---

## 6. ローカル開発用シードアカウント

ローカル開発時は Resend 経由のメール送信が機能しないため、Magic Link フローを踏まずに管理画面へ入れるシードアカウントを用意する。**本番 D1 には絶対に適用しない。**

### 方針

| 項目 | 内容 |
|---|---|
| **場所** | `scripts/seed-dev.ts`（本番マイグレーションとは別ファイル） |
| **実行方法** | `pnpm seed:dev`（ローカル D1 のみ対象） |
| **内容** | `stores` 1 件（`status = "active"`）＋`sessions` 1 件（固定トークン）を INSERT |
| **認証** | スクリプト実行後に出力される `session_token` 値を Cookie に手動セットして `/admin` へアクセス |

### シードデータ仕様

```
stores:
  id:           <スクリプト実行時に crypto.randomUUID() で生成>
  name:         "開発用テスト店舗"
  email:        "dev@localhost"
  status:       "active"
  slug:         "dev-store"
  activated_at: <スクリプト実行時刻>
  created_at:   <スクリプト実行時刻>

sessions:
  id:            <スクリプト実行時に crypto.randomUUID() で生成>
  store_id:      <上記 stores.id>
  session_token: <スクリプト実行時に crypto.randomUUID() で生成>  ← 実行のたびに変わる
  expires_at:    now + 365 日（ローカルで期限切れを気にしない）
  created_at:    <スクリプト実行時刻>
```

`session_token` は実行時に生成し、スクリプト終了時に stdout へ出力する。git 履歴に固定値を残さない。

### ブラウザへの Cookie セット手順

```
$ pnpm seed:dev
✓ Seeded: dev@localhost (dev-store)
  session_token: <生成されたトークン値>
  → DevTools > Application > Cookies > Name: session_token, Value: <上記>, Path: /
```

または出力に `document.cookie = '...'` の JS スニペットを含める形でも可（実装時に選択）。

### ガードレール

- `scripts/seed-dev.ts` の冒頭で環境変数 `NODE_ENV` または Wrangler の `env` を確認し、`production` では即 exit する
- `pnpm seed:dev` スクリプトはローカル D1 ターゲット（`wrangler d1 execute --local`）にのみ接続する設定にする
- `scripts/seed-dev.ts` は `.gitignore` に含めず、意図的にコードレビューできる状態にしておく（本番流出リスクはコードレベルで防ぐ）

---

## 7. 将来拡張

### 7.1 SaaS 利用料の課金ゲート

差し込み位置・`pending_payment` 状態・PSP webhook の設計は「2. stores.status 状態遷移」の設計メモを参照。

### 7.2 複数スタッフ・ロール管理

現在は 1 店舗 = 1 オーナーの認証。将来 `staff` テーブルと `staff_sessions` を追加することで、スタッフごとの個別認証・権限分離（閲覧のみ / 管理権限など）が可能。

### 7.3 セッション有効期限のスライディングウィンドウ

現状は固定 30 日。将来は `last_used_at` を更新し、アクティブな間は期限を延長するスライディングウィンドウに変更可能。`sessions` テーブルに `last_used_at` カラムを追加するだけで対応できる（初期設計では NULL 許容で予約しておく）。
