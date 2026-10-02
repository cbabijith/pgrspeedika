import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";
import { normalizePhone, type ShopSettings } from "@pgrs/contracts";
import { serverFetch } from "@/lib/server-api";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const shop = await serverFetch<Omit<ShopSettings, "gstin">>("/api/shop");
  let whatsapp: string | null = null;
  try {
    if (shop?.whatsapp) whatsapp = normalizePhone(shop.whatsapp).replace(/^\+/, "");
  } catch {
    /* An incomplete shop profile should not show an invalid WhatsApp link. */
  }
  return (
    <StaticPage title="Contact us" intro="Call, WhatsApp or visit the shop.">
      <h2>Shop</h2>
      <p>
        {shop?.addressLine || "PGRS Peedika, Kottayam district, Kerala"}
        <br />
        {shop?.phone ? (
          <>
            <a href={`tel:${shop.phone}`}>{shop.phone}</a> (shop phone)
          </>
        ) : null}
      </p>
      <h2>WhatsApp</h2>
      <p>
        {whatsapp ? (
          <a href={`https://wa.me/${whatsapp}`} rel="noreferrer" target="_blank">
            Message us on WhatsApp
          </a>
        ) : (
          "Shop WhatsApp contact will appear here when available."
        )}
      </p>
      <h2>Timings</h2>
      <p>
        {shop
          ? `Shop hours: ${shop.openTime}–${shop.closeTime}. ${shop.weeklyClosedDay === "none" ? "Open every day." : `Closed on ${shop.weeklyClosedDay}.`}`
          : "Contact the shop for opening hours."}{" "}
        We accept requests across Kottayam district. Delivery charges and timing are confirmed on WhatsApp.
      </p>
      {shop?.addressLine ? (
        <>
          <h2>Find us</h2>
          <p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.addressLine)}`}
              rel="noreferrer"
              target="_blank"
            >
              Open in Google Maps
            </a>
          </p>
        </>
      ) : null}
    </StaticPage>
  );
}
