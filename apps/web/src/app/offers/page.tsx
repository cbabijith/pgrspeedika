import { Suspense } from "react";
import type { Metadata } from "next";
import { CatalogBrowser } from "@/components/catalog-browser";

export const metadata: Metadata = {
  title: "Offers",
  description: "Current coupons and offers at PGRS Peedika.",
};

export default function OffersPage() {
  return (
    <Suspense>
      <CatalogBrowser
        title="Offers & best value picks"
        subtitle="Use coupon WELCOME10 for 10% off your first order above ₹199 (up to ₹50 off). FLAT30 gives ₹30 off orders above ₹499."
        baseQuery={{}}
      />
    </Suspense>
  );
}
