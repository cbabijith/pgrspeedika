# PGRS Peedika 🥬

Online store for a local Indian vegetable & grocery shop — fresh produce by
weight, bilingual (English/മലയാളം) catalog, guest-only WhatsApp checkout across
Kottayam district and a mobile shop-owner panel. Delivery charges and timing are
agreed with the shop on WhatsApp before the owner confirms the request.

Built as a **pnpm + Turborepo monorepo**:

```
pgrs-peedika/
├─ apps/
│  ├─ web/        customer storefront  (Next.js 15, React 19)
│  ├─ admin/      shop owner panel     (Next.js 15, TanStack Table)
│  ├─ backend/    Hono API + shared worker handlers (Node)
│  └─ worker/     separate outbox worker process
├─ packages/
│  ├─ db/         Drizzle schema, migrations, seed
│  ├─ contracts/  Zod schemas + shared types (single source of truth)
│  ├─ events/     event names, payload types, outbox publisher
│  ├─ auth/       Better Auth server config + React client
│  ├─ ui/         green/white design system (Tailwind v4 tokens)
│  └─ config/     shared tsconfigs, eslint base, prettier, theme tokens
```

The web and admin apps call the backend through the typed Hono RPC client
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

# 4. run everything (web :3000, admin :3001, api :4000, plus outbox worker)
pnpm dev
```

Useful scripts:

| command                                       | what it does                                              |
| --------------------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                                    | web + admin + backend + worker (Turborepo)                |
| `pnpm --filter @pgrs/worker dev`              | run only the outbox worker                                |
| `pnpm db:generate` / `db:migrate` / `db:seed` | Drizzle migrations + seed                                 |
| `pnpm lint` / `typecheck` / `test` / `build`  | the whole monorepo (CI parity)                            |
| `pnpm e2e:isolated`                           | browser suite in a temporary database on separate ports   |
| `pnpm e2e`                                    | browser suite against explicitly configured test services |

### Run the grocery shop

The public shop accepts guest order requests throughout **Kottayam district**,
using the [district PIN-code directory](https://kottayam.nic.in/en/std-pin-codes/).
There is no customer login, OTP or delivery-slot selection in the shopping flow.
The shop confirms delivery fees and timing on WhatsApp at **+91 94471 14449**.

1. Use Admin → Settings to edit the store name and WhatsApp contact. Add or rename
   categories and products. Vegetables, Fruits and Groceries have real representative
   photographs; source and license credits are available at `/photo-credits`.
2. Enter loose-produce stock in **kg** and packaged stock in **packs**. Use daily
   Prices to update all weight variants together; inventory records stock corrections.
3. Customers add multiple products without leaving the list. A persistent bottom
   basket bar appears immediately and leads to guest checkout.
4. Checkout takes a name, phone, address, town and Kottayam PIN. It saves a private
   order request, then redirects to WhatsApp with the complete basket and address.
   The customer presses **Send** in WhatsApp. Interrupted requests can be retried
   without duplicating orders; receipts stay on the customer's device.
5. Requests appear in Admin → Orders as **Awaiting confirmation**. After agreeing
   delivery on WhatsApp, the owner enters the fee, date and timing and confirms.
   Confirmation reserves stock atomically. Unconfirmed requests do not reserve it.
6. Pack using actual weights, send for delivery, record the final cash amount and
   mark delivered. The customer's private tracking link shows the adjusted bill.

Configured zones, minimum orders and slots remain available for the legacy direct
checkout APIs; they do not block the public WhatsApp request flow. Automated outbound
messages require a real notification provider; the default provider only logs them.
See [WhatsApp setup](docs/whatsapp-ordering.md).

The release step applies migrations and upgrades default photos/categories/contact
in place. It preserves existing orders, prices, stock and owner-uploaded images.
Do not enable `SEED_ON_DEPLOY` on an existing store: seeding resets the catalog.

### Implementation audit

The existing project already supplied catalog, inventory, authenticated checkout,
order fulfilment and an outbox worker. The store completion addressed these gaps:

- Guest checkout is now the default for visitors, with private tracking and order
  history on their device. A claimed phone number cannot expose saved account details.
- Web and WhatsApp retries share transaction-safe order numbering and idempotency;
  duplicate inbound webhook message IDs replay the existing order.
- Packaged products reserve/consume packs; loose products reserve/consume grams.
  Concurrent orders, stock corrections, packing and cancellation preserve stock.
- Product edits preserve variant IDs, SKUs and images, keeping existing carts valid.
  Hidden categories/products cannot be ordered; products with open orders cannot be deleted.
- Public requests validate Kottayam PIN codes and current prices. The owner reserves
  stock only after agreeing delivery. Legacy direct checkout also enforces active zones,
  minimum orders, holiday closures and slot capacity.
- Worker database effects and event completion commit together. Provider failures
  roll back effects and retry; outbound providers receive stable idempotency keys.
- Shared UI stylesheet paths, browser test commands and integration-test database
  safeguards were corrected. Private pages are excluded from the offline cache.

### Test accounts

- **Owner (admin):** email + password from `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` in `.env`.
- **Customers:** guest checkout; no account or OTP is required. Legacy authentication
  APIs remain available for compatibility. Their test OTP helper must stay disabled
  in production.

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

**Storefront (`apps/web`)** — mobile bottom navigation, visible basket shortcut,
product photographs with credits, bilingual search, category filters, pack selectors
and quantity controls; guest-only WhatsApp requests with private receipts and tracking;
delivery agreed with the shop; final weight-adjusted bill; informational pages and
home-screen manifest. Customer authentication and direct COD/UPI APIs remain for
compatibility but are not part of the public checkout.

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

## Phone shopping and owner workspace

The storefront has a mobile bottom bar (Home, Shop, Cart, Orders), pack selectors,
quantity controls in each product card and a live basket shortcut. Adding items on
lists keeps the shopper on the list. Category filters and Load more retain the
basket; checkout and WhatsApp orders work without creating an account.

The owner workspace has Orders, Products, Categories, Stock and More in its mobile
bottom bar. Products link directly to daily Prices and stock management. Product
and category names are editable, slugs are generated on creation when blank, and
Malayalam names are optional. Packaged groceries count stock in packs and keep a
price per pack, including weight-labelled bags; loose produce uses kg stock and
can have its pack prices recalculated from a daily ₹/kg rate.

For local phone testing, connect the phone to the computer's Wi-Fi network and
open `http://<computer-LAN-IP>:3000` (shop) or `:3001` (owner). Add both exact LAN
origins to `CORS_ORIGINS` in the root `.env` and restart the backend. In development,
when `NEXT_PUBLIC_API_URL` is unset for the frontends, API requests use the browser's
hostname on port 4000. If you set that variable, use an API hostname reachable from
the phone. Do not use `localhost` on the phone. Production deployments require the
configured public API URL and HTTPS. Both sites include home-screen manifests and
icons; home-screen installation on a deployed site requires HTTPS.

## Testing

- `pnpm test` — Vitest: INR formatting, GST-inclusive billing, coupon rules,
  weight-adjustment recomputation, mock + webhook signature verification; plus
  integration tests (stock reservation, atomic slot capacity, holiday closure,
  and a full **checkout pipeline test** — placement with server-verified
  totals/coupon/reservation/outbox, idempotent replay, rejection of unserved
  pincodes and below-minimum carts, packing with actual weights, cancellation
  with stock/slot release) running against the database in `.env.test`
  (the database must be available and its name must contain `_test`; tests fail
  early instead of silently skipping). The store regressions additionally cover
  private guest access, concurrent retries/stock edits/payments/packing/cancellation,
  packaged stock, catalog edits, webhook signatures/replays and worker rollback/retry.
- `pnpm e2e:isolated` — Playwright creates, migrates and seeds a temporary test
  database, starts API/web/admin on ports 4100/3100/3101, runs the suite and drops
  that database. The PostgreSQL role needs CREATE DATABASE permission. Override
  ports with `E2E_API_PORT`, `E2E_WEB_PORT`, `E2E_ADMIN_PORT` if needed. Includes
  legacy OTP/API compatibility, admin packing, full guest WhatsApp fulfilment with
  catalog/stock/price forms, mobile validation and interrupted-response retries,
  guest basket persistence, small-phone catalog paging/quantities/stock limits,
  desktop/mobile basket visibility and price-service failure recovery, plus mobile
  owner category rename, pack pricing, stock and order confirmation/fulfilment,
  plus same-origin owner sign-in, protected API access, reload and sign-out.
- `pnpm e2e` — use a separately configured test database and seeded owner, with
  `ENABLE_TEST_OTP=true`. Do not run the browser fixtures against live store data.
- `apps/web/scripts/lighthouse-mobile.sh` — Lighthouse **mobile** audit
  (standard simulated 4G throttling) for the Phase 5 ≥90 performance gate.
  Verified on the production build: **home 95 / product 98** performance,
  accessibility 93/97, best-practices 96, SEO 100.

## Deployment notes

- **Railway (GitHub-only):** the repo is deploy-ready via per-service
  `railway.json` config-as-code (`apps/backend`, `apps/worker`, `apps/web`,
  `apps/admin`) — migrations run pre-deploy and the first deploy can seed the
  catalog + owner. Full step-by-step: **[docs/railway.md](docs/railway.md)**.
- **Owner sessions:** the admin uses same-origin `/api` requests, forwarded to
  `BACKEND_URL` or `NEXT_PUBLIC_API_URL` by its Next.js rewrite. This keeps the
  HttpOnly session cookie on the admin site, so separate Railway domains and
  browsers that block third-party cookies work without weakening SameSite settings.
  Keep the admin origin in the backend's `CORS_ORIGINS` / trusted origins.
- Set env vars from `.env.example` (validated with Zod at startup); generate
  `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. Never commit real secrets.
- Storage defaults to the local-disk driver; set `STORAGE_DRIVER=s3` plus the
  R2/S3 vars and a public `S3_PUBLIC_URL` for production uploads.
- Run `pnpm --filter @pgrs/backend start` (API) and
  `pnpm --filter @pgrs/worker start` (worker) after `pnpm build`; both are stateless, so scale horizontally
  behind a load balancer (swap the in-memory rate limiter for Redis). Web and
  admin bind `$PORT` via plain `next start`.
- CI (`.github/workflows/ci.yml`) runs migrations + `turbo lint typecheck test
build` on a Postgres service, plus a Playwright job.

## Brand

Primary green `#1B7A3E`, dark green `#14532D`, soft surface `#E8F5E9`, white
background, amber `#F5A623` reserved for offers/badges — defined once as
Tailwind v4 `@theme` tokens in `packages/config/tailwind/theme.css` and reused
by every app and `packages/ui`. The logo is a replaceable SVG component
(`packages/ui/src/logo.tsx`).
