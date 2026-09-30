import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = { title: "FAQ" };

export default function FaqPage() {
  return (
    <StaticPage title="Frequently asked questions">
      <h2>How does weight-based billing work?</h2>
      <p>
        Loose produce is priced per kg. When you order 500 g of tomato we reserve roughly 500 g, but the
        actual weight may differ slightly. At packing we record the real weight and recompute your bill — you
        always pay for what is actually packed. Prepaid differences are refunded automatically; for cash on
        delivery you pay the final amount at the door.
      </p>
      <h2>Which pincodes do you deliver to?</h2>
      <p>
        670001 (Kannur Town), 670007 (Thalassery), 670012 (Chelari Road) and 671314 (Kasaragod–Kanhangad).
        Enter your pincode at the top of the site to confirm.
      </p>
      <h2>What are the delivery slots and cut-offs?</h2>
      <ul>
        <li>Morning 7–9 AM — order by 9:00 PM the previous day.</li>
        <li>Evening 5–7 PM — order by 12:00 PM the same day.</li>
      </ul>
      <h2>Is there a minimum order?</h2>
      <p>
        Minimums depend on your area (₹99 in Kannur town, higher on the outskirts). Delivery is free above the
        zone&apos;s free-delivery threshold.
      </p>
      <h2>Can I cancel my order?</h2>
      <p>
        Yes — until the order is packed. Open the order in Your Orders and tap Cancel. Prepaid amounts are
        refunded to the original payment method.
      </p>
      <h2>Do prices change?</h2>
      <p>
        Vegetable prices are updated every morning based on the market. The price you see at checkout is
        locked for that order.
      </p>
    </StaticPage>
  );
}
