import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartDrawer } from "@/components/cart-drawer";
import { MobileShoppingNav } from "@/components/mobile-shopping-nav";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "PGRS Peedika · Fresh vegetables & groceries delivered in Kottayam district",
    template: "%s · PGRS Peedika",
  },
  description:
    "Order farm-fresh vegetables, fruits, rice, spices and daily groceries from PGRS Peedika. Morning and evening delivery slots in Kottayam district. Fresh today, every day.",
  applicationName: "PGRS Peedika",
  appleWebApp: { capable: true, title: "PGRS Peedika", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  keywords: ["vegetables online", "grocery Kerala", "Kottayam grocery delivery", "PGRS Peedika"],
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
  viewportFit: "cover",
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
          <div className="bg-primary-surface px-3 py-2 text-center text-xs font-semibold text-primary-700">
            Kottayam district · Guest checkout · Delivery confirmed on WhatsApp
          </div>
          <main id="main">{children}</main>
          <Footer />
          <CartDrawer />
          <MobileShoppingNav />
          <ServiceWorker />
        </Providers>
      </body>
    </html>
  );
}
