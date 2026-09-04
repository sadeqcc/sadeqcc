# SADEQ DRAWER — Cash & Gold Reconciliation

مطابقة يومية لدرج محل الذهب: كاش بالدرهم الإماراتي، وذهب بالغرام لكل عيار على حدة،
مع الذهب الموجود خارج الدرج، والأمانات والديون والعمولات والمبيعات غير المسجلة.

Daily drawer reconciliation for a gold shop — cash in AED and gold in grams per karat,
including gold held outside the drawer, customer deposits, debts, commissions and
unregistered or duplicated sales.

## What it does

- **Cash side and system side are computed separately**, so an adjustment can never land on the wrong side.
- **Every karat is independent** — 995, 22K, 21K, 18K, 16K, 14K (and any karat you add).
- **One permanent record per business day** (Asia/Dubai), auto-saved as a draft and locked when finalized.
- **A finalized day keeps a snapshot** of its inputs, results, engine version, precision and tolerances — a movement recorded later never rewrites a closed day.
- **Nothing is deleted silently**: soft deletes, an audit log with old/new values, and a 5-second undo on ordinary edits.

### The equations

```
Adjusted Physical Cash = Physical drawer cash
                       + Principal + Debts + Commissions + custom "add to physical"
                       − Customer deposits (amanat) − Unregistered sales − custom "subtract from physical"

Adjusted System Cash   = System cash
                       − Duplicate sales − Incorrect system entries
                       + custom "add to system" − custom "subtract from system"

Cash Difference        = Adjusted Physical − Adjusted System
```

```
Accounted Store Gold (per karat) = Gold in drawer
                                 + with Ashraf + with people + with offices + with factory/goldsmith
                                 − third-party (borrowed) gold

Gold Difference        = Accounted − System
```

Money is stored as whole **fils** (2 decimals) and gold as whole **milligrams** (3 decimals).
No floating-point arithmetic touches a stored value or a total, so `0.1 + 0.2` is exactly `0.30`.

## Running it

```bash
npm install
cp .env.example .env.local        # set AUTH_SECRET
npm run dev                       # http://localhost:3000
```

The first visit asks you to create the owner account — that account owns all the data,
and every API route is scoped to its owner id.

```bash
npm run build && npm start        # production
npm test                          # calculation engine unit tests
npm run typecheck                 # no TypeScript errors
```

## Deploying

The database is the source of truth; the browser only keeps an offline cache.

- **Any Node host (VPS, Fly, Render, Docker):** keep the default `DATABASE_URL=file:./data/sadeq.db`
  and mount `./data` on a persistent volume.
- **Vercel or any serverless host:** create a free [Turso](https://turso.tech) database and set
  `DATABASE_URL=libsql://…` + `DATABASE_AUTH_TOKEN=…`. The same schema and code path are used.

Always set a long random `AUTH_SECRET` — the app refuses to start a session without one in production.

## Structure

```
src/lib/num.ts        decimal-safe parsing/formatting (fils, milligrams)
src/lib/calc.ts       the calculation engine + non-destructive difference suggestions
src/lib/history.ts    per-day digests, monthly statistics, as-of-date gold movements
src/lib/db.ts         SQLite / libSQL driver, schema and migrations
src/lib/repo.ts       owner-scoped queries, audit log, soft delete/restore
src/lib/schemas.ts    zod validation — amounts and weights are always positive
src/app/api/…         REST routes: day, gold, records, movements, history, backup, auth
src/app/…             Home, Cash, Gold, Reports, Settings, Login
tests/calc.test.ts    engine tests (matched / short / over / amanat / Ashraf / partial return / 0.001 g)
```

## Features

**Cash** — system cash, physical total or an AED note & coin counter (1000…1 AED plus coins),
principal, debts, commissions, customer deposits, unregistered sales, duplicate sales,
incorrect system entries, custom adjustments with an explicit direction, and a full
step-by-step breakdown behind “Show calculation”.

**Gold** — one card per karat with system weight, drawer weight, gold with Ashraf (21K),
gold with people/offices/factories/goldsmiths, third-party gold shown in its own style,
accounted weight, difference and status. Movements carry a delivery date, an expected
return date, a receipt photo and a status (outstanding / partially returned / returned / overdue),
and returns are recorded as dated events so history never shifts.

**Reports** — a month calendar marking shortage (red), surplus (green), matched (gold check),
draft (orange) and finalized (purple lock) with the cash difference under each day;
monthly analytics with a daily difference chart and a comparison to the previous month;
ten CSV reports, print/PDF, full JSON backup and a validated restore.

**Settings** — Arabic RTL / English LTR, dark and light, six palettes, employee and shop name,
gold precision (0.001 / 0.010 / 0.100 g), per-karat tolerance, karat management, people and
offices, a PIN for sensitive actions, tips and alerts toggles, backup and restore.

**PWA** — installable, works offline: drafts written while offline are queued with
client-generated ids and replayed on reconnect, so a replay can never duplicate a row.

## Security

Owner-only access with scrypt password hashing and a signed HttpOnly session cookie;
every route validates its input on the server; rate limiting on auth, writes and restore;
attachments are stored owner-scoped and served only to their owner; financial values are
never written to server logs; a PIN plus a written reason is required to reopen a
finalized day or restore a backup.
