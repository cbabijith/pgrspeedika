import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = { title: "FAQ" };

export default function FaqPage() {
  return (
    <StaticPage title="Frequently asked questions">
      <h2>Do I need an account?</h2>
      <p>
        No. Add items to your basket, enter your name, mobile number and delivery address, then continue to
        WhatsApp. There is no login or OTP.
      </p>
      <h2>Where can I order?</h2>
      <p>
        We accept order requests from Kottayam district. Enter your Kottayam pincode at checkout. The shop
        confirms delivery availability, charges and timing on WhatsApp.
      </p>
      <h2>How do I send the order?</h2>
      <p>
        Checkout opens WhatsApp with your selected items, quantities, prices and address filled in. Press Send
        in WhatsApp. Your request also appears in the shop&apos;s order list.
      </p>
      <h2>When is my order confirmed?</h2>
      <p>
        The request awaits shop confirmation. The shop agrees delivery details with you before confirming and
        packing. Your private tracking link shows updates.
      </p>
      <h2>How does billing work?</h2>
      <p>
        The basket shows the items total. Delivery charges are agreed separately on WhatsApp. Loose produce is
        weighed at packing and the final bill reflects the actual weight. Packaged groceries are billed per
        pack. Pay cash on delivery.
      </p>
      <h2>Can I change or cancel my order?</h2>
      <p>Contact the shop on WhatsApp with your order number before packing begins.</p>
      <h2>Are these photos of the shop&apos;s stock?</h2>
      <p>
        The catalogue uses representative product photos. Varieties and packaging may differ. Ask the shop on
        WhatsApp if you need a particular brand or variety.
      </p>
    </StaticPage>
  );
}
