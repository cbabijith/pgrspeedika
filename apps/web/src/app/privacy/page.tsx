import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <StaticPage title="Privacy policy" intro="Last updated: January 2026.">
      <h2>What we collect</h2>
      <ul>
        <li>Your name and phone number (used for login and delivery).</li>
        <li>Delivery addresses you save.</li>
        <li>Order and payment records (Razorpay handles card/UPI details; we never see them).</li>
      </ul>
      <h2>How we use it</h2>
      <p>
        To deliver your orders, send order updates over SMS/WhatsApp, and improve the shop. We do not sell
        your data to anyone.
      </p>
      <h2>Cookies</h2>
      <p>
        A single login cookie keeps you signed in. Your cart and language preference are stored on your own
        device.
      </p>
      <h2>Your rights</h2>
      <p>
        Write to us at the shop phone/WhatsApp and we will delete your account and data, as permitted by
        record-keeping requirements (GST invoices).
      </p>
    </StaticPage>
  );
}
