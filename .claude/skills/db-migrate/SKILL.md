---
name: db-migrate
description: Generate Drizzle migrations from schema changes and apply them to local D1. Use this whenever the schema in packages/db/src/schema/ has been modified, when migrations need to be regenerated, or when pnpm db:generate or pnpm db:reset needs to run — don't run those commands directly, invoke this skill instead.
disable-model-invocation: true
---

Run the following steps in order:

1. Run `pnpm db:generate` to generate migration SQL from schema diff.
2. Show the user the generated SQL file(s) in `packages/db/drizzle/` and ask for confirmation before applying. Warn explicitly that `db:reset` wipes **all local D1 data** regardless of SQL content — especially flag if the SQL contains `DROP TABLE`, `DROP COLUMN`, or `ALTER TABLE ... RENAME`.
3. Once confirmed, run `pnpm db:reset` to wipe local D1 and re-apply all migrations.
4. Run `ls packages/db/drizzle/` and show the migration file list so the user can confirm the expected files are present.

If `pnpm db:generate` produces no new files, tell the user that the schema is already in sync with the migrations.
