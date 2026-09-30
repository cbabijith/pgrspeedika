import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@pgrs/ui";
import { serverFetch } from "@/lib/server-api";
import { ProductDetailClient } from "@/components/product-detail-client";
import type { ProductCard, ProductDetail } from "@pgrs/contracts";

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await serverFetch<{ product: ProductDetail }>(
    `/api/catalog/products/${encodeURIComponent(slug)}`,
  );
  const product = data?.product;
  if (!product) return { title: "Product" };
  const price = (product.variants[0]?.pricePaise ?? 0) / 100;
  return {
    title: `${product.nameEn} (${product.nameMl})`,
    description: product.description ?? `Fresh ${product.nameEn} at ₹${price.toFixed(2)} from PGRS Peedika.`,
    openGraph: {
      title: product.nameEn,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await serverFetch<{ product: ProductDetail; related: ProductCard[] }>(
    `/api/catalog/products/${encodeURIComponent(slug)}`,
  );
  if (!data?.product) notFound();

  const { product, related } = data;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.nameEn,
    description: product.description ?? undefined,
    image: product.imageUrl ?? undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: ((product.variants[0]?.pricePaise ?? 0) / 100).toFixed(2),
      availability:
        product.availableQuantity == null || product.availableQuantity > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductDetailClient product={product} related={related} />
      <nav aria-label="Breadcrumb" className="container-page pb-4 text-xs text-muted">
        <ol className="flex gap-1.5">
          <li>
            <Link href="/" className="hover:underline">
              Home
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={`/category/${product.categorySlug}`} className="hover:underline">
              {product.categorySlug.replaceAll("-", " ")}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="font-semibold text-ink">
            {product.nameEn}
          </li>
        </ol>
      </nav>
      <div className="hidden">
        <Badge>schema</Badge>
      </div>
    </>
  );
}
