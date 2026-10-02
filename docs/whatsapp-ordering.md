# Guest WhatsApp ordering

The public shop is guest-only. Add several products, review the fixed bottom basket bar, then continue to `/checkout` (also available at `/whatsapp`). Enter a name, 10-digit mobile number, house/street, town and a Kottayam district pincode. Landmark and order notes are optional. No login, OTP, enabled delivery zone, slot selection or minimum order is required for a request.

`POST /api/whatsapp/request` prices the basket from active catalogue records and saves an `awaiting_confirmation` order. It neither claims a login account nor reserves stock or delivery capacity. An idempotency key survives a lost response so retrying creates one order. The response includes an HMAC-protected private tracking link and a `wa.me` URL with the items, quantities, prices, address and notes. The configured shop number starts as **+91 94471 14449**; the owner can change it in Settings.

The browser redirects to WhatsApp in the same tab. The customer presses **Send** in WhatsApp. The receipt and tracking link are kept in the guest history on that device. A link to reopen WhatsApp remains on the receipt if the app handoff is interrupted. Delivery charges, timing, availability and the final bill are explicitly awaiting confirmation.

In Admin → Orders, open the request and chat with the customer. Enter the agreed delivery fee, date and timing, then confirm. Confirmation reserves stock in one transaction; insufficient stock leaves the request unchanged. Packing records actual loose-item weights and packaged item counts, recomputes the bill and commits inventory. Record cash collection and delivery as usual. Cancelling an unconfirmed request never releases another order's reservations.

Backend startup applies data migrations and upgrades the seeded photos, categories and contact in place. It preserves IDs, prices, stock, existing orders and owner-uploaded photos. The contact is set once so later owner changes persist. All 97 representative product photographs are bundled as WebP assets and credited at `/photo-credits`.

The older `/api/whatsapp/order`, `/api/checkout/guest` and authenticated order APIs remain available for fixed-zone/slot orders. They retain their stock, zone, minimum-order, slot-capacity and payment checks. Optional inbound webhook support remains signature-verified. The worker's console provider logs notifications; it does not send WhatsApp messages. Automatic provider notifications require a configured notifier. The customer handoff works independently of that provider.

`pnpm test` covers billing, reservations, private tracking, retries, request confirmation, cancellations and worker processing. `pnpm e2e:isolated` creates and drops a separate test database, exercising phone/desktop baskets, photographs, no-login checkout, the exact WhatsApp redirect, owner catalogue/price/stock controls, confirmation, packing, cash collection and delivery. WhatsApp is intercepted during tests; no messages are sent.
