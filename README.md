# GOLD ORDERS

**Gold Order Tracking & Delivery Management** — a mobile-first application for a real gold
jewellery business. It follows every customer order from the moment it is taken at the counter
until the customer has the piece in hand.

```
Ordered → Maker → Ready → Traveler → Arrived → Delivered
```

All dates and times are **Asia/Dubai**. Money is **AED to 2 decimals**, gold weight is **grams to
3 decimals**, and neither is ever computed with floating point.

---

## What it answers at a glance

The home screen exists to answer these without opening a second screen:

1. Which orders are late? — overdue orders are detected automatically and pinned to the top.
2. Which orders need action today? — the follow-up list is derived from live order state.
3. Which orders are with makers, ready, travelling, or arrived?
4. Which customers still owe money?
5. What is the expected versus actual weight?
6. Who currently has each piece, and when must it be delivered?

## Features

**Orders** — auto-numbered (`GO-2026-0001`), full status flow with a permanent timeline, quick
entry at the counter with everything else behind *More Details*, auto-saved drafts, duplicate-order
warnings, tags, unlimited pinned notes, photos and videos per order.

**Priority** — an order whose expected delivery date has passed while it is neither delivered nor
cancelled is overdue. It moves to the top of every list and stays there until it closes. Urgency
bands: Critical (>7 days), High (3–7), Late (1–2), Due Today, Due Tomorrow.

**Money** — full payment history (never one deposit field), old-gold exchange counted toward what
the customer has paid, per-gram or per-ounce or manual gold rates, per-gram or fixed making charges,
other charges, discount and VAT. Overpayment shows as customer credit, never a negative balance.

**People** — customers with order history and outstanding balance, makers with active/ready/late
counts, travelers with grouped shipments, packing lists and bulk arrival.

**Everywhere else** — global search, filters, sorting, calendar, notifications, reports, financial
dashboard, CSV exports, full JSON backup and validated restore, printing (customer receipt, maker
job sheet, traveler packing list, delivery receipt).

**Safety** — nothing is destroyed. Records are archived, every create/edit/delete/status change is
written to the audit log with the old and new value, and deleting a financial record needs a
confirmation plus the security PIN.

## Roles

| | Owner | Manager | Employee |
|---|---|---|---|
| Create / update orders | ✓ | ✓ | ✓ |
| Change status | ✓ | ✓ | ✓ |
| Add payments | ✓ | ✓ | ✓ |
| Edit / delete payments | ✓ | ✓ | — |
| Cancel orders | ✓ | ✓ | — |
| Reports & financials | ✓ | ✓ | — |
| Settings, staff, backup | ✓ | — | — |

The first account created owns the shop. Staff are added from **Settings → Staff**.

## Running it

```bash
npm install
cp .env.example .env.local     # set AUTH_SECRET (required in production)
npm run dev                    # http://localhost:3000
```

Open the app and create the owner account on first launch.

```bash
npm run build && npm start     # production
npm run typecheck              # strict TypeScript, no errors
npm test                       # calculation and priority tests
npm run icons                  # regenerate the PWA icons
```

### Configuration

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | Signs the session cookie. Required in production, minimum 16 characters. |
| `DATABASE_URL` | `file:./data/gold-orders.db` (default) or `libsql://…` for Turso. |
| `DATABASE_AUTH_TOKEN` | Turso token, when using libSQL. |

## Architecture

```
src/lib/      types · num · date · calc · db · auth · api · repo · orders · insights · schemas · client
src/app/api/  auth · orders · payments · exchanges · notes · media · directory · dashboard ·
              search · reports · calendar · notifications · users · export · backup
src/app/      dashboard · orders · order detail · new/edit · customers · makers · travelers ·
              calendar · reports · notifications · follow-up · settings · print
```

- **`num.ts`** stores money as integer fils and weight as integer milligrams. Parsing, formatting,
  `mulDiv` and percentage-by-basis-points all operate on integers, so a total is reproducible.
- **`calc.ts`** is pure: pricing, balance, weight comparison, urgency, priority ordering, warnings
  and duplicate detection. It is what the test suite covers.
- **`orders.ts`** owns writes: order totals are recomputed from live payment and exchange rows after
  every change, and each status move appends to `order_status_history` without touching what is
  already there.
- **`insights.ts`** builds the dashboard, notifications, follow-ups, reports and calendar.
- Server routes validate every input with zod, guard on a permission, and never trust a client total.

### Database

SQLite by default (libSQL/Turso for a hosted deployment). Tables: `users`, `app_settings`,
`customers`, `makers`, `travelers`, `traveler_shipments`, `orders`, `order_status_history`,
`payments`, `gold_exchanges`, `order_notes`, `order_media`, `follow_ups`, `tags`, `audit_logs`,
`order_counters`. Every record carries `id`, `ownerId`, `createdAt`, `updatedAt`, `createdBy`,
`status` and a nullable `deletedAt`.

## Offline

The app installs as a PWA. The shell is precached, recent screens are cached for reading, and writes
made offline are queued in the browser with a client-generated id. Replaying a queued write cannot
duplicate a row, because the server treats a known id as the same record.

## Design

Dark charcoal ground, gold accents, white text, soft grey secondary. Light and system themes are
supported; dark is the default. Status colour is never the only signal — every badge pairs colour
with an icon and a word, controls are at least 46px, and wide content scrolls inside its own box.
