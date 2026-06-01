# ドキュメント一覧

`order-manager`（飲食店向けモバイルオーダー＆レジ SaaS）の設計ドキュメントです。

## 読む順番

1. **[要件定義書](./requirements.md)** — 何を作るか。登場人物・4 画面の役割・業務サイクル・MVP スコープ
2. **[技術アーキテクチャ](./architecture.md)** — どう作るか。技術スタック・ディレクトリ構成・マルチテナント設計・認証・リアルタイム通知
3. **[データモデル設計](./data-model.md)** — データをどう持つか。テーブル定義・状態遷移・将来拡張の設計メモ
4. **[開発ロードマップ](./roadmap.md)** — いつ・何を作るか。フェーズ分割・Phase 1 の実装着手順・完了基準

## 関連ファイル

- `astro.config.mjs` — Astro + Cloudflare アダプタ設定
- `drizzle.config.ts` — Drizzle ORM / D1 設定（スキーマ: `src/db/schema.ts`）
- `wrangler.jsonc` — Cloudflare Workers デプロイ設定
- `package.json` — 依存パッケージ・スクリプト一覧
