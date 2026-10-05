# Railway — migrate on deploy

The API does **not** apply SQL from request handlers. Pending files in `apps/backend/src/db/migrations/` (`001_foundation.sql` through `024_catalog_client_key.sql`, including `023_quote_snapshot_delete.sql`) run in a **separate process** before the HTTP server starts.

## What to set on the API service

Use the **repo root** as the Railway service root (this repo’s `package.json`).

| Field | Set this |
| --- | --- |
| **Build Command** | Leave empty, or `npm run build` |
| **Start Command** | Leave empty, or `npm start` |
| **Root Directory** | Empty (repo root) |

`npm start` is `migrate then API`:

```bash
npm run start --workspace=apps/backend
# → node dist/db/migrate.js && node dist/index.js
```

If you set a **custom** Start Command, it must still run migrations first, for example:

```bash
npm start
```

or, equivalent:

```bash
node apps/backend/dist/db/migrate.js && node apps/backend/dist/index.js
```

(that second form assumes the process working directory is the **repo root** after a successful build).

**Do not** set Start Command to only `node dist/index.js` / `node apps/backend/dist/index.js`. That boots the API without `009` (`quotes.is_archived`) and any later files.

If **Root Directory** is `apps/backend` instead of the repo root, Start Command is still `npm start` (same `migrate.js && index.js` script).

## Safe to run on every boot?

Yes, for this runner:

- Already-applied files are rows in `_migrations` and are skipped, including `023_quote_snapshot_delete.sql` and `024_catalog_client_key.sql`.
- A Postgres advisory lock serializes two replicas so they cannot both `ADD COLUMN` the same pending file.
- If a file fails, that process exits **non-zero** and the shell does not start `index.js`. The API is not listening.
- If migrations succeed and the process then fails while closing its pool, it still exits non-zero and `index.js` does not start.
- If `index.js` throws before `listen` (bad `DATABASE_URL`, bad `JWT_ACCESS_SECRET`, or pg-boss cannot start), it exits non-zero and does not accept traffic.
- One JSON line, `migrations_complete`, reports `applied` and `skipped` counts. After listen, one JSON line `server_listening` reports `port`. Neither line includes `DATABASE_URL` or a password.
- A second SIGTERM or SIGINT during the 20s pg-boss stop exits the process. It does not start a second pool shutdown.

GitHub Actions job `postgres` (Postgres 16) applies every SQL file on an empty database and re-runs the runner. The second run must skip every file, including 023 and 024, then the integration tests run. That job is not a live Railway service.

Local first-time / laptop (no `dist/` needed):

```bash
cd apps/backend && npm run migrate
```

Production one-off (after `npm run build`):

```bash
cd apps/backend && node dist/db/migrate.js
```

`DATABASE_URL` must be a `postgres://` or `postgresql://` URL with a host, or a keyword string with `host=` / `hostaddr=` (Railway Postgres plugin). Missing, blank, and invalid values throw before the pool is used and before listen. The error text does not include the URL. Optional voice and R2 keys still only warn; they do not block boot.

## Probes

| Path | Meaning |
| --- | --- |
| `GET /health` | Liveness. Always `{ "status": "ok" }` once the process is listening. It does not query Postgres and does not hang when the database is down. |
| `GET /ready` | Readiness. `SELECT 1` on the app pool. `200` `{ "status": "ready" }` or `503` `{ "status": "not_ready" }`. No error text, host, or URL. |

Neither route is served while migrations are still running, because the API process has not started. Use `/health` for a process liveness check. Use `/ready` when the caller needs to know the pool can run a query.

This is not a claim that a live demo is deployed. These paths are covered by unit tests. They have not been exercised against a live Railway service.

Android preview APKs that should hit this API use `EXPO_PUBLIC_API_URL=https://<your-railway-host>` at EAS build time — [EAS-ANDROID.md](EAS-ANDROID.md).
