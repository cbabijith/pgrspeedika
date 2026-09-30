import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = { title: "About us" };

export default function AboutPage() {
  return (
    <StaticPage title="About PGRS Peedika" intro="A village shop, online.">
      <p>
        PGRS Peedika started as a small village store (peedika) on Market Road, Kannur. Every morning we buy
        vegetables and fruits from local farmers in and around the district, and stock the rice, grains,
        spices and daily essentials Kerala kitchens rely on.
      </p>
      <h2>Why shop with us</h2>
      <ul>
        <li>Farm-fresh produce sourced daily — never overnight stock.</li>
        <li>Loose items are weighed again at packing; you pay only the actual weight.</li>
        <li>Morning (7–9 AM) and evening (5–7 PM) delivery slots.</li>
        <li>Transparent prices in English and Malayalam, GST-correct invoices.</li>
      </ul>
      <h2>Where we deliver</h2>
      <p>
        We currently serve Kannur town and nearby pincodes (670001, 670007, 670012) and Kasaragod–Kanhangad
        (671314), and we are growing every month.
      </p>
    </StaticPage>
  );
}
