# Railway — migrate on deploy

The API does **not** apply SQL from request handlers. Pending files in `apps/backend/src/db/migrations/` (`001` … `009_quote_archive.sql` and later) run once at process start, then the HTTP server starts.

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

- Already-applied files are rows in `_migrations` and are skipped.
- A Postgres advisory lock serializes two replicas so they cannot both `ADD COLUMN` the same pending file.
- If a file fails, the process exits **before** `index.js`. Railway should not serve traffic on a half-migrated schema.

Local first-time / laptop (no `dist/` needed):

```bash
cd apps/backend && npm run migrate
```

Production one-off (after `npm run build`):

```bash
cd apps/backend && node dist/db/migrate.js
```

`DATABASE_URL` must be set (Railway Postgres plugin). This is not a claim that a live demo is deployed.
