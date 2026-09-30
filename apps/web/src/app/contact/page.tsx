import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <StaticPage title="Contact us" intro="Call, WhatsApp or visit the shop.">
      <h2>Shop</h2>
      <p>
        PGRS Peedika, Market Road, Kannur, Kerala 670001
        <br />
        <a href="tel:+914901234567">+91 490 123 4567</a> (shop phone)
      </p>
      <h2>WhatsApp</h2>
      <p>
        <a href="https://wa.me/919999888877" rel="noreferrer" target="_blank">
          Message us on WhatsApp
        </a>{" "}
        — orders, item requests, complaints, anything.
      </p>
      <h2>Timings</h2>
      <p>
        Monday–Sunday, 6:30 AM – 9:30 PM. Delivery slots: 7–9 AM (order by 9 PM the previous day) and 5–7 PM
        (order by 1 PM the same day).
      </p>
      <h2>Find us</h2>
      <p>
        <a
          href="https://www.google.com/maps/search/?api=1&query=Market+Road+Kannur+Kerala"
          rel="noreferrer"
          target="_blank"
        >
          Open in Google Maps
        </a>
      </p>
    </StaticPage>
  );
}
