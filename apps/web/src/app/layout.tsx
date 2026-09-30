import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartDrawer } from "@/components/cart-drawer";
import { PincodeCheck } from "@/components/pincode-check";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  title: {
    default: "PGRS Peedika · Fresh vegetables & groceries delivered in Kannur",
    template: "%s · PGRS Peedika",
  },
  description:
    "Order farm-fresh vegetables, fruits, rice, spices and daily groceries from PGRS Peedika. Morning and evening delivery slots across Kannur and Kasaragod. Fresh today, every day.",
  applicationName: "PGRS Peedika",
  manifest: "/manifest.webmanifest",
  keywords: ["vegetables online", "grocery Kerala", "Kannur grocery delivery", "PGRS Peedika"],
  openGraph: {
    title: "PGRS Peedika",
    description: "Fresh vegetables and groceries delivered to your door.",
    type: "website",
    locale: "en_IN",
  },
};

export const viewport: Viewport = {
  themeColor: "#1B7A3E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <Header />
          <PincodeCheck />
          <main id="main">{children}</main>
          <Footer />
          <CartDrawer />
          <ServiceWorker />
        </Providers>
      </body>
    </html>
  );
}
