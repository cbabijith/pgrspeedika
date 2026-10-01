# PGRS Peedika 🥬

Online store for a local Indian vegetable & grocery shop — fresh produce by
weight, Kannur/Kasaragod delivery slots, bilingual (English/മലയാളം) catalog,
Razorpay + cash on delivery, and a full shop-owner admin panel.

Built as a **pnpm + Turborepo monorepo**:

```
pgrs-peedika/
├─ apps/
│  ├─ web/        customer storefront  (Next.js 15, React 19)
│  ├─ admin/      shop owner panel     (Next.js 15, TanStack Table)
│  └─ backend/    Hono API + event worker (Node)
├─ packages/
│  ├─ db/         Drizzle schema, migrations, seed
│  ├─ contracts/  Zod schemas + shared types (single source of truth)
│  ├─ events/     event names, payload types, outbox publisher
│  ├─ auth/       Better Auth server config + React client
│  ├─ ui/         green/white design system (Tailwind v4 tokens)
│  └─ config/     shared tsconfigs, eslint base, prettier, theme tokens
```

Dependency flow: `db → contracts → apps`. Apps never import each other; the web
and admin apps call the backend **only** through the typed Hono RPC client
(`hc<PublicAppType>` / `hc<AdminAppType>`) wrapped in TanStack Query hooks.
Zustand holds only the guest cart, UI language, pincode and drawer state.

---

## Quick start

Requirements: **Node 20+**, **pnpm 10+**, **PostgreSQL 14+**.

```bash
# 1. install
pnpm install

# 2. configure
cp .env.example .env        # then edit DATABASE_URL + BETTER_AUTH_SECRET

# 3. database (schema + realistic Kerala catalog + owner account)
pnpm db:migrate
pnpm db:seed                # prints/logs owner credentials source

# 4. run everything (web :3000, admin :3001, api :4000)
pnpm dev                    # add `pnpm --filter @pgrs/backend dev:worker` for events
```

Useful scripts:

| command                                       | what it does                                       |
| --------------------------------------------- | -------------------------------------------------- |
| `pnpm dev`                                    | web + admin + backend (Turborepo)                  |
| `pnpm --filter @pgrs/backend dev:worker`      | outbox worker (notifications, counters)            |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Drizzle migrations + seed                          |
| `pnpm lint` / `typecheck` / `test` / `build`  | the whole monorepo (CI parity)                     |
| `pnpm --filter web exec playwright test`      | E2E suite (OTP login, COD checkout, admin packing) |

### Test accounts

- **Owner (admin):** email + password from `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` in `.env`.
- **Customers:** any Indian mobile number — sign in at `/login` with phone OTP.
  In development the OTP is printed in the **backend console**; with
  `ENABLE_TEST_OTP=true` it is also served at `GET /api/auth/test-otp?phone=…`.

### Payments without Razorpay keys

Leave `RAZORPAY_*` empty and the backend runs payments in **mock mode**: order
creation returns a locally-signed pseudo-payment so UPI/COD flows work end to
end. Add real test keys to switch to the hosted Razorpay checkout; webhook
signature verification (`x-razorpay-signature` HMAC) is always enforced.

---

## Architecture

```
 Browser (web/admin)                  Hono API (:4000)                    Postgres
┌────────────────────┐   hc RPC     ┌──────────────────────┐   Drizzle  ┌─────────┐
│ Next.js RSC/Client ├─────────────▶│ modules (zod-valid.) ├───────────▶│ tables  │
│ TanStack Query     │   cookies    │ services (pure logic)│            └─────────┘
│ Zustand (cart/UI)  │◀─────────────┤ auth (Better Auth)    │
└────────────────────┘              └───────┬──────────────┘
                                            │ same tx INSERT
                                            ▼
                                     outbox_events ──▶ worker (FOR UPDATE
                                                       SKIP LOCKED, retries,
                                                       dead-letter) ──▶ SMS /
                                                       in-app notifications
```

- **Transactional outbox:** every domain change (order placed/packed/delivered,
  refunds, stock events, user registered) is written to `outbox_events` in the
  same transaction. The worker polls with `FOR UPDATE SKIP LOCKED`, retries with
  exponential backoff, dead-letters after 5 attempts; handlers are idempotent.
  Producers only know the `EventPublisher` interface, so BullMQ/Redis can replace
  the poller later without touching them.
- **Money is integer paise everywhere** (₹1 = 100), formatted with Indian digit
  grouping. Loose produce is priced per kg and sold in 250 g steps via
  `product_variants` (weight vs unit types).
- **Weight adjustment:** order items store `ordered_qty_grams` and
  `final_qty_grams`. Packing recomputes the bill proportionally to actual
  weights; prepaid differences are refunded automatically, COD collects the
  final amount.
- **No overselling:** stock reservation (`stock - reserved >= amount`) and slot
  capacity (`booked < capacity`) are enforced with atomic `UPDATE … RETURNING`
  inside the order transaction; totals are always recomputed server-side.
- **GST:** every product carries HSN + GST%; prices are GST-inclusive and the
  invoice renders a CGST/SGST breakup using the shop GSTIN from settings.

## Feature map

**Storefront (`apps/web`)** — banner carousel, category grid, fresh-today /
best-sellers / seasonal rails; bilingual instant search (EN + മലയാളം) with
filters and sorting; product pages with variant selector; guest cart (persisted
locally) merged into the server cart at OTP login; pincode serviceability gate;
checkout with addresses, slot availability, coupons, COD/UPI; order tracking
timeline, final weight-adjusted bill, invoice PDF, one-click reorder,
cancellation with automatic refund; account, wishlist, notifications;
About/Contact/FAQ/Privacy/Terms/Refund pages; PWA (manifest + offline shell),
sitemap, robots, JSON-LD structured data.

**Admin (`apps/admin`)** — dashboard (orders by status, revenue, new customers,
low stock, slot utilization, 14-day sales chart); products CRUD with variants,
duplicate, CSV import/export; **quick price board** (inline edits, bulk %
preview, save-all with audit); categories; inventory adjustments with movement
history; order board (Kanban + table) and detail with **packing screen** (actual
weights → bill recalculation), fulfilment actions, rider assignment, COD cash
recording, refunds, invoice & packing-slip PDFs; delivery routes grouped by
area; zones/slots CRUD; customers (block/unblock); coupons; banners; review
moderation with replies; reports (sales by day/product/category, GST summary,
payment split, top customers) with CSV export; staff & roles; shop settings;
audit log of sensitive actions.

**Backend (`apps/backend`)** — modules for auth, catalog, search, cart,
checkout, orders, payments (Razorpay order creation + **signature-verified,
idempotent webhook**), reviews/wishlist/notifications, uploads (S3 presign /
local dev driver), health + typed-RPC docs; role-based authorization
(owner/manager/packer/delivery) enforced per permission; Zod validation on every
input, consistent error envelope, request IDs + structured pino logs, CORS
locked to known origins, per-IP and per-flow rate limits (OTP, login, checkout),
idempotency keys for order/payment creation.

## Testing

- `pnpm test` — Vitest: INR formatting, GST-inclusive billing, coupon rules,
  weight-adjustment recomputation, mock + webhook signature verification; plus
  integration tests (stock reservation, atomic slot capacity, holiday closure,
  and a full **checkout pipeline test** — placement with server-verified
  totals/coupon/reservation/outbox, idempotent replay, rejection of unserved
  pincodes and below-minimum carts, packing with actual weights, cancellation
  with stock/slot release) running against the database in `.env.test`
  (skipped when unreachable).
- `pnpm --filter web exec playwright test` — Playwright E2E: phone-OTP login,
  COD checkout end-to-end, admin packing an order with the customer verifying
  the adjusted bill. Requires `ENABLE_TEST_OTP=true` and the seeded owner.
- `apps/web/scripts/lighthouse-mobile.sh` — Lighthouse **mobile** audit
  (standard simulated 4G throttling) for the Phase 5 ≥90 performance gate.
  Verified on the production build: **home 95 / product 98** performance,
  accessibility 93/97, best-practices 96, SEO 100.

## Deployment notes

- **Same-site cookies:** deploy web + admin + api under one registrable domain
  (e.g. `pgrspeedika.com`, `admin.pgrspeedika.com`, `api.pgrspeedika.com`) so
  the session cookie works with `sameSite=lax`; `useSecureCookies` turns on
  automatically in production.
- Set env vars from `.env.example` (validated with Zod at startup); generate
  `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. Never commit real secrets.
- Storage defaults to the local-disk driver; set `STORAGE_DRIVER=s3` plus the
  R2/S3 vars and a public `S3_PUBLIC_URL` for production uploads.
- Run `node dist/index.js` (API) and `node dist/worker/run.js` (worker) from
  `apps/backend` after `pnpm build`; both are stateless, so scale horizontally
  behind a load balancer (swap the in-memory rate limiter for Redis).
- CI (`.github/workflows/ci.yml`) runs migrations + `turbo lint typecheck test
build` on a Postgres service, plus a Playwright job.

## Brand

Primary green `#1B7A3E`, dark green `#14532D`, soft surface `#E8F5E9`, white
background, amber `#F5A623` reserved for offers/badges — defined once as
Tailwind v4 `@theme` tokens in `packages/config/tailwind/theme.css` and reused
by every app and `packages/ui`. The logo is a replaceable SVG component
(`packages/ui/src/logo.tsx`).
