import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = { title: "Refund & cancellation policy" };

export default function RefundPolicyPage() {
  return (
    <StaticPage title="Refund & cancellation policy">
      <h2>Cancellation</h2>
      <ul>
        <li>You can cancel any time before the order is packed — from Your Orders or by calling us.</li>
        <li>
          Prepaid orders: the full amount is refunded automatically to the original payment method within 3–5
          working days.
        </li>
        <li>COD orders: nothing to refund.</li>
      </ul>
      <h2>Weight adjustments</h2>
      <p>
        If loose items pack lighter than ordered, the difference is refunded automatically for prepaid orders.
        For COD, you simply pay the reduced final amount at the door. If items pack heavier, we absorb up to
        the bill shown at checkout — you never pay more than your order total.
      </p>
      <h2>Damaged or missing items</h2>
      <p>
        Report within 24 hours of delivery (photo on WhatsApp helps). We refund the item value or replace it
        in the next slot, your choice.
      </p>
    </StaticPage>
  );
}
