# WhatsApp ordering

Two WhatsApp lanes, both landing as **real orders in the admin panel**:

1. **Guest web → WhatsApp (no account).** A customer browses the shop, taps
   `+` on items, then opens **`/whatsapp`** (or taps "Order on WhatsApp" in
   the cart / home page). They fill name, WhatsApp number, address and
   pincode — no login. On submit:
   - the backend creates a real order (source `whatsapp`, cash on delivery,
     next bookable slot auto-picked, zone/pincode and minimum-order enforced,
     stock reserved);
   - their details are **saved against the phone number** — next visit the
     form prefills automatically ("Welcome back…");
   - the shop is notified through the WhatsApp notification channel; and
   - a `wa.me` deep link containing the complete order opens so the customer
     sends the same order into the shop's chat — one tap on _Send_.

2. **Inbound WhatsApp messages (optional bot).** Point a WhatsApp Business
   (Meta Cloud API) webhook at `POST /api/whatsapp/webhook` and customers can
   text an order straight to the shop number:

   ```
   2 kg tomato
   thakkali 500 g
   1 matta rice 5 kg
   Name: Ravi
   Address: Mullakam house, Market road
   Pincode: 670001
   ```

   The parser matches English, Malayalam and keyword names, converts weights
   to the nearest pack size (2 kg tomato → 4 × 500 g), auto-picks the slot
   and creates the order; the customer gets a confirmation reply with the
   order number and total. Unrecognized messages get a how-to-order template
   back. Set `WHATSAPP_APP_SECRET` (enforces the `X-Hub-Signature-256` HMAC)
   and `WHATSAPP_VERIFY_TOKEN` (GET subscription verification) in the
   environment; replies are delivered through the `NotificationProvider`
   (`console` in dev, `webhook` in production — see `.env.example`).

## Where things show up

- **Admin panel → Orders:** WhatsApp orders carry a 💬 badge; a _Source_
  filter (All / Web / WhatsApp) narrows the board and table. Everything else
  works identically: packing with actual weights, delivery assignment, COD
  collection, invoices.
- **Order records:** `orders.source` is `web` or `whatsapp` (default `web`);
  history, reports and GST summaries include both lanes.
- **Shop's WhatsApp number** is configured in **Admin → Settings → WhatsApp**
  (`shop.profile.whatsapp`), used both for the `wa.me` link and the shop-side
  notification.

## API surface

| Method   | Path                                | Purpose                                             |
| -------- | ----------------------------------- | --------------------------------------------------- |
| GET      | `/api/whatsapp/shop`                | shop number + next bookable slot                    |
| GET      | `/api/whatsapp/customer?phone=+91…` | saved name/address for repeat orders                |
| POST     | `/api/whatsapp/order`               | place a guest order (rate-limited, zone/min checks) |
| GET/POST | `/api/whatsapp/webhook`             | Meta webhook verification / inbound messages        |

Tests: `apps/backend/tests/whatsapp.integration.test.ts` covers the parser
(EN/ML/keywords, weight→pack conversion, missing pincode rejection) and the
full order path (totals, saved details, repeat-phone reuse, stock reservation,
outbox event, wa.me link, unserved pincode and minimum-order rejections).
