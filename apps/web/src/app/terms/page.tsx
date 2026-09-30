import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <StaticPage title="Terms of use" intro="The simple rules of shopping with us.">
      <h2>Orders</h2>
      <p>
        Prices shown at checkout are locked for your order. Loose items are billed by actual packed weight
        within ±50% of the ordered quantity; large shortfalls will be communicated before packing.
      </p>
      <h2>Payments</h2>
      <p>
        We accept UPI/cards via Razorpay and cash on delivery in served pincodes. Prepaid amounts for
        cancelled or under-weight orders are refunded to the original payment method.
      </p>
      <h2>Slots</h2>
      <p>
        Each delivery slot has limited capacity. Once a slot is full it is closed; cut-off times are shown at
        checkout.
      </p>
      <h2>Liability</h2>
      <p>
        Our responsibility is limited to the value of the affected items. Fresh produce may vary naturally in
        size and colour.
      </p>
    </StaticPage>
  );
}
