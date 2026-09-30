import Link from "next/link";
import { EmptyState } from "@pgrs/ui";

export default function NotFound() {
  return (
    <div className="container-page py-16">
      <EmptyState
        title="Page not found"
        description="The page you are looking for may have moved or the product is no longer listed."
        action={
          <Link href="/" className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white">
            Back to the shop
          </Link>
        }
      />
    </div>
  );
}
