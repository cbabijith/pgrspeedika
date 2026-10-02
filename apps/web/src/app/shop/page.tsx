import { Suspense } from "react";
import { CatalogBrowser } from "@/components/catalog-browser";
export const metadata = { title: "Shop vegetables & groceries" };
export default function ShopPage() {
  return (
    <Suspense>
      <CatalogBrowser
        title="Shop vegetables & groceries"
        subtitle="Choose your packs and add several items as you browse."
        baseQuery={{}}
      />
    </Suspense>
  );
}
