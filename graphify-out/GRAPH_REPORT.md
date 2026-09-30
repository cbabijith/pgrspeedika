# Graph Report - apps (2026-10-01)

## Corpus Check

- Corpus is ~36,334 words - fits in a single context window. You may not need a graph.

## Summary

- 748 nodes · 1913 edges · 47 communities (40 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: AST uses 0 LLM tokens; semantic agent token usage was unavailable.

## Community Hubs (Navigation)

- Backend Context and Notifications
- Cart Pricing and Mutations
- Storefront Cart and Preferences
- Account and Order Queries
- Admin Package Dependencies
- Web Package Dependencies
- Orders and Inventory
- Order Management Routes
- Shared UI and Contracts
- Catalog Pages and Framework
- Backend Package Dependencies
- Admin Catalog and Permissions
- Payment Processing
- Informational Pages
- Admin Runtime Dependencies
- Marketing and Account Routes
- Web Runtime Dependencies
- API Route Composition
- Checkout and Rate Limits
- Catalog Queries
- Backend Runtime Dependencies
- Platform Administration
- Order Validation and Errors
- Homepage and Discovery
- Storefront Layout and Providers
- Authentication Middleware
- Invoices and Packing Slips
- Web Development Dependencies
- Admin Development Dependencies
- Backend Run Scripts
- Delivery Slot Booking
- Media Uploads
- Backend Development Dependencies
- Checkout Interface
- Web TypeScript Configuration
- Web Run Scripts
- Backend TypeScript Configuration
- Admin Run Scripts
- Phone Login Interface
- Guest Cart Persistence
- Generated Product Illustrations
- Web Lint Configuration
- Application Icon
- Backend Type Exports
- Next Type Declarations
- Stylesheet Build Configuration
- Offline Service Worker

## God Nodes (most connected - your core abstractions)

1. `notFound()` - 37 edges
2. `newHono()` - 36 edges
3. `ok()` - 33 edges
4. `useUIStore` - 31 edges
5. `AppContext` - 23 edges
6. `unwrap()` - 23 edges
7. `drizzle-orm` - 20 edges
8. `badRequest()` - 19 edges
9. `conflict()` - 19 edges
10. `buildApp()` - 18 edges

## Surprising Connections (you probably didn't know these)

- `PackOrderInput` --references--> `SessionUser` [EXTRACTED]
  backend/src/services/orders.ts → backend/src/lib/context.ts
- `buildApp()` --calls--> `getEnv()` [EXTRACTED]
  backend/src/app.ts → backend/src/env.ts
- `buildApp()` --calls--> `createAppContext()` [EXTRACTED]
  backend/src/app.ts → backend/src/lib/app-context.ts
- `buildApp()` --calls--> `log()` [EXTRACTED]
  backend/src/app.ts → backend/src/lib/app-context.ts
- `buildApp()` --calls--> `errorResponse()` [EXTRACTED]
  backend/src/app.ts → backend/src/lib/errors.ts

## Import Cycles

- None detected.

## Communities (47 total, 7 thin omitted)

### Community 0 - "Backend Context and Notifications"

Cohesion: 0.07
Nodes (34): envSchema, getEnv(), { app }, env, server, createAppContext(), createNotificationProviderSingleton(), log() (+26 more)

### Community 1 - "Cart Pricing and Mutations"

Cohesion: 0.10
Nodes (38): cartRoutes(), previewCart(), previewQuerySchema, addItems(), applyCouponToCart(), getCartDTO(), getOrCreateCart(), mergeGuestCart() (+30 more)

### Community 2 - "Storefront Cart and Preferences"

Cohesion: 0.12
Nodes (19): WishlistPage(), AccountClient(), AddToCartPanel(), CartDrawer(), CartFull(), CheckoutClient(), placeOrder(), payWithRazorpay() (+11 more)

### Community 3 - "Account and Order Queries"

Cohesion: 0.14
Nodes (20): ext_packages_auth_src_client_ts, ref_tanstack_react_query, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_auth_src_client_createpgrsauthclient, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_iscancellable, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_order_timeline, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_ui_src_index_alert, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_ui_src_index_button, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_ui_src_index_card (+12 more)

### Community 4 - "Admin Package Dependencies"

Cohesion: 0.06
Nodes (30): clsx, eslint, hono, @hookform/resolvers, lucide-react, next, @pgrs/auth, @pgrs/backend (+22 more)

### Community 5 - "Web Package Dependencies"

Cohesion: 0.06
Nodes (30): @playwright/test, clsx, eslint, hono, @hookform/resolvers, lucide-react, next, @pgrs/auth (+22 more)

### Community 6 - "Orders and Inventory"

Cohesion: 0.08
Nodes (27): ALLOWED_TRANSITIONS, CaptureInput, computeAdjustedLine(), OrderListFilters, OrderSummary, PackOrderInput, PlaceOrderInput, PlaceOrderResult (+19 more)

### Community 7 - "Order Management Routes"

Cohesion: 0.19
Nodes (23): conflict(), notFound(), adminOrderRoutes(), boardQuery, statusTransitionSchema, statusValues, orderRoutes(), buildInvoicePdf() (+15 more)

### Community 8 - "Shared UI and Contracts"

Cohesion: 0.17
Nodes (16): ext_packages_contracts_src_index_ts, ext_packages_ui_src_index_ts, ref_sonner, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_formatgrams, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_formatinr, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_lang, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_productcard, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_productdetail (+8 more)

### Community 9 - "Catalog Pages and Framework"

Cohesion: 0.12
Nodes (8): ref_next, ref_react, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_ui_src_index_select, nextConfig, revalidate, metadata, metadata, CatalogBrowser()

### Community 10 - "Backend Package Dependencies"

Cohesion: 0.09
Nodes (21): hono, @pgrs/auth, @pgrs/config, @pgrs/contracts, @types/node, typescript, typescript-eslint, zod (+13 more)

### Community 11 - "Admin Catalog and Permissions"

Cohesion: 0.20
Nodes (19): writeAudit(), requireStaff(), ok(), adminCatalogRoutes(), parseCsvLine(), replaceProductChildren(), Tx, adminRoutes() (+11 more)

### Community 12 - "Payment Processing"

Cohesion: 0.16
Nodes (19): Env, isRazorpayConfigured(), paymentFailed(), capturePayment(), ensureProviderOrder(), markPaymentFailed(), authHeader(), createProviderOrder() (+11 more)

### Community 13 - "Informational Pages"

Cohesion: 0.13
Nodes (7): metadata, metadata, metadata, metadata, metadata, metadata, StaticPage()

### Community 14 - "Admin Runtime Dependencies"

Cohesion: 0.11
Nodes (19): dependencies, clsx, hono, @hookform/resolvers, lucide-react, next, @pgrs/auth, @pgrs/backend (+11 more)

### Community 15 - "Marketing and Account Routes"

Cohesion: 0.13
Nodes (16): AppContext, moderateSchema, suggestQuery, searchSuggest(), @hono/zod-validator, ref_zod, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_bannerinputschema, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_couponinputschema (+8 more)

### Community 16 - "Web Runtime Dependencies"

Cohesion: 0.11
Nodes (18): dependencies, clsx, hono, @hookform/resolvers, lucide-react, next, @pgrs/auth, @pgrs/backend (+10 more)

### Community 17 - "API Route Composition"

Cohesion: 0.31
Nodes (14): AdminAppType, AppType, AppVariables, buildAdminAppType(), buildApp(), buildPublicAppType(), PublicAppType, newHono() (+6 more)

### Community 18 - "Checkout and Rate Limits"

Cohesion: 0.17
Nodes (15): rateLimited(), Bucket, buckets, prune(), RATE_LIMITS, rateLimit(), RateLimitOptions, checkoutRoutes() (+7 more)

### Community 19 - "Catalog Queries"

Cohesion: 0.29
Nodes (15): catalogRoutes(), fetchProductRows(), getProductDetail(), homeFeed(), listCategories(), listProducts(), productRatingSummary(), ProductRow (+7 more)

### Community 20 - "Backend Runtime Dependencies"

Cohesion: 0.12
Nodes (16): dependencies, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, better-auth, dotenv, drizzle-orm, hono, @hono/node-server (+8 more)

### Community 21 - "Platform Administration"

Cohesion: 0.13
Nodes (14): AuditDb, better-auth, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_shopsettingsschema, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_slotinputschema, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_staffinviteschema, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_staffupdateschema, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_zoneinputschema, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_db_src_index_account (+6 more)

### Community 22 - "Order Validation and Errors"

Cohesion: 0.23
Nodes (13): ApiHttpError, badRequest(), couponInvalid(), errorResponse(), flattenZodError(), minOrderNotMet(), outOfStock(), parseWith() (+5 more)

### Community 23 - "Homepage and Discovery"

Cohesion: 0.18
Nodes (10): ref_lucide_react, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_category, HomePage(), metadata, revalidate, revalidate, BannerCarousel(), BannerItem (+2 more)

### Community 24 - "Storefront Layout and Providers"

Cohesion: 0.16
Nodes (9): users_abijithcb_desktop_projects_code201_pgrspeedika_packages_ui_src_index_logo, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_ui_src_index_toaster, web_src_app_globals, metadata, viewport, Footer(), PincodeCheck(), Providers() (+1 more)

### Community 25 - "Authentication Middleware"

Cohesion: 0.21
Nodes (12): getSessionUser(), requireAuth(), SessionUser, forbidden(), unauthorized(), PgrsHono, PgrsVariables, ref_hono (+4 more)

### Community 26 - "Invoices and Packing Slips"

Cohesion: 0.22
Nodes (10): buildOrderPdf(), buildSlipPdfBuilder(), DocumentKind, getShopProfile(), ShopProfile, ext_packages_config_tailwind_tokens_ts, pdfkit, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_config_tailwind_tokens_tokens (+2 more)

### Community 27 - "Web Development Dependencies"

Cohesion: 0.18
Nodes (11): devDependencies, eslint, @pgrs/config, @playwright/test, tailwindcss, @tailwindcss/postcss, @types/node, @types/react (+3 more)

### Community 28 - "Admin Development Dependencies"

Cohesion: 0.20
Nodes (10): devDependencies, eslint, @pgrs/config, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+2 more)

### Community 29 - "Backend Run Scripts"

Cohesion: 0.20
Nodes (10): scripts, build, dev, dev:worker, lint, start, start:worker, test (+2 more)

### Community 30 - "Delivery Slot Booking"

Cohesion: 0.36
Nodes (9): slotUnavailable(), bookSlot(), istMinutesNow(), istTodayDateString(), releaseSlot(), slotAvailabilityForDate(), slotAvailabilityForDateUsingTx(), Tx (+1 more)

### Community 31 - "Media Uploads"

Cohesion: 0.22
Nodes (9): localUploadsRoot(), resolveWithinUploads(), safeKey(), @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, ref_node_crypto, ref_node_fs, ref_node_path (+1 more)

### Community 32 - "Backend Development Dependencies"

Cohesion: 0.22
Nodes (9): devDependencies, @pgrs/config, tsup, tsx, @types/node, @types/pdfkit, typescript, typescript-eslint (+1 more)

### Community 33 - "Checkout Interface"

Cohesion: 0.22
Nodes (4): users_abijithcb_desktop_projects_code201_pgrspeedika_packages_contracts_src_index_address, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_ui_src_index_field, users_abijithcb_desktop_projects_code201_pgrspeedika_packages_ui_src_index_textarea, PaymentMethod

### Community 34 - "Web TypeScript Configuration"

Cohesion: 0.25
Nodes (7): @pgrs/config/tsconfig.nextjs.json, compilerOptions, baseUrl, paths, exclude, extends, include

### Community 35 - "Web Run Scripts"

Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, start, test:e2e, test:e2e:ci, typecheck

### Community 36 - "Backend TypeScript Configuration"

Cohesion: 0.29
Nodes (6): compilerOptions, paths, types, extends, include, @pgrs/config/tsconfig.node.json

### Community 37 - "Admin Run Scripts"

Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, start, typecheck

### Community 38 - "Phone Login Interface"

Cohesion: 0.33
Nodes (4): metadata, LoginForm(), sendOtp(), verify()

### Community 39 - "Guest Cart Persistence"

Cohesion: 0.50
Nodes (3): ref_zustand, CartLineInput, CartState

## Knowledge Gaps

- **263 isolated node(s):** `name`, `version`, `private`, `dev`, `build` (+258 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 382 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `drizzle-orm` connect `Payment Processing` to `Backend Context and Notifications`, `Cart Pricing and Mutations`, `Orders and Inventory`, `Order Management Routes`, `Backend Package Dependencies`, `Admin Catalog and Permissions`, `Marketing and Account Routes`, `API Route Composition`, `Checkout and Rate Limits`, `Catalog Queries`, `Platform Administration`, `Invoices and Packing Slips`, `Delivery Slot Booking`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `@hono/zod-validator` connect `Marketing and Account Routes` to `Cart Pricing and Mutations`, `Order Management Routes`, `Backend Package Dependencies`, `Admin Catalog and Permissions`, `Payment Processing`, `Checkout and Rate Limits`, `Catalog Queries`, `Platform Administration`, `Media Uploads`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Backend Runtime Dependencies` to `Backend Package Dependencies`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _263 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend Context and Notifications` be split into smaller, more focused modules?**
  _Cohesion score 0.07315233785822021 - nodes in this community are weakly interconnected._
- **Should `Cart Pricing and Mutations` be split into smaller, more focused modules?**
  _Cohesion score 0.10336817653890824 - nodes in this community are weakly interconnected._
- **Should `Storefront Cart and Preferences` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._

## Review scope and limitations

Graph snapshot covers the apps at the start of this review. Admin source files were added concurrently afterward and are not represented in this graph. Shared packages and new admin files were inspected separately for the code review. Graph diagnostics reported 396 dangling endpoint edges, 3 self-loops, and 21 collapsed same-endpoint edges. Treat the graph as a navigation aid; review findings were checked against source. Structural extraction uses no LLM tokens. Actual token usage for the icon semantic subtask was not exposed; generated zero token fields are placeholders, not measured totals.
