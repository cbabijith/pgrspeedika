import Link from "next/link";
import { Logo } from "@pgrs/ui";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-primary-700 text-primary-50">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="space-y-3">
          <div className="rounded-card bg-white/95 p-2.5">
            <Logo />
          </div>
          <p className="text-sm text-primary-100">
            Fresh vegetables and groceries from our village shop, delivered to your kitchen across Kannur and
            Kasaragod.
          </p>
        </div>
        <nav aria-label="Shop" className="text-sm">
          <p className="mb-3 font-bold text-white">Shop</p>
          <ul className="space-y-2 text-primary-100">
            <li>
              <Link href="/category/vegetables" className="hover:text-white">
                Vegetables
              </Link>
            </li>
            <li>
              <Link href="/category/fruits" className="hover:text-white">
                Fruits
              </Link>
            </li>
            <li>
              <Link href="/category/leafy-greens" className="hover:text-white">
                Leafy Greens
              </Link>
            </li>
            <li>
              <Link href="/category/rice-and-grains" className="hover:text-white">
                Rice &amp; Grains
              </Link>
            </li>
            <li>
              <Link href="/offers" className="hover:text-white">
                Offers
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Company" className="text-sm">
          <p className="mb-3 font-bold text-white">Company</p>
          <ul className="space-y-2 text-primary-100">
            <li>
              <Link href="/about" className="hover:text-white">
                About us
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-white">
                Contact &amp; timings
              </Link>
            </li>
            <li>
              <Link href="/faq" className="hover:text-white">
                FAQ
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Policies" className="text-sm">
          <p className="mb-3 font-bold text-white">Policies</p>
          <ul className="space-y-2 text-primary-100">
            <li>
              <Link href="/privacy" className="hover:text-white">
                Privacy policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-white">
                Terms of use
              </Link>
            </li>
            <li>
              <Link href="/refund-policy" className="hover:text-white">
                Refund &amp; cancellation
              </Link>
            </li>
          </ul>
          <p className="mt-4 text-xs text-primary-200">
            Order by phone:{" "}
            <a href="tel:+914901234567" className="underline">
              +91 490 123 4567
            </a>
          </p>
        </nav>
      </div>
      <div className="border-t border-primary-600 py-4 text-center text-xs text-primary-200">
        © {new Date().getFullYear()} PGRS Peedika · Fresh from our village to your kitchen
      </div>
    </footer>
  );
}
