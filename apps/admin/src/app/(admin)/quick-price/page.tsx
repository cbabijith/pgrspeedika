"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Percent, Save } from "lucide-react";
import { Badge, Button, Card, Input, Money, Select } from "@pgrs/ui";
import { formatINR } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";

interface AdminVariant {
  id: string;
  labelEn: string;
  pricePaise: number;
  unitType: "weight" | "unit";
  baseQuantity: number;
}

interface AdminProduct {
  id: string;
  slug: string;
  nameEn: string;
  nameMl: string;
  sellingType: "loose" | "packaged";
  categorySlug: string;
  variants: AdminVariant[];
}

/** Rounded price of a weight variant derived from a ₹/kg rate. */
function packPriceFromPerKg(perKgPaise: number, baseQuantity: number): number {
  return Math.max(0, Math.round((perKgPaise * baseQuantity) / 1000));
}

/** Current effective ₹/kg rate of a product (from its 1 kg pack, else derived). */
function currentPerKg(product: AdminProduct, edits: Record<string, number>): number | null {
  const weightVariants = product.variants.filter((v) => v.unitType === "weight");
  if (weightVariants.length === 0) return null;
  const kilo = weightVariants.find((v) => v.baseQuantity === 1000);
  if (kilo) return edits[kilo.id] ?? kilo.pricePaise;
  const first = weightVariants[0]!;
  return Math.round(((edits[first.id] ?? first.pricePaise) * 1000) / first.baseQuantity);
}

/** Daily price board: ₹/kg editing for loose items, bulk %, one save. */
export default function QuickPricePage() {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState("vegetables");
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [bulkPercent, setBulkPercent] = useState("-5");
  const [saving, setSaving] = useState(false);

  const products = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => unwrap<AdminProduct[]>(api.api.admin.products.$get({ query: {} })),
  });

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return (products.data ?? []).filter(
      (p) =>
        (categoryFilter === "all" || p.categorySlug === categoryFilter) &&
        (!q || p.nameEn.toLowerCase().includes(q) || p.nameMl.includes(search) || p.slug.includes(q)),
    );
  }, [products.data, categoryFilter, search]);

  const categories = useMemo(() => {
    const set = new Set((products.data ?? []).map((p) => p.categorySlug));
    return [...set];
  }, [products.data]);

  const variantRows = useMemo(() => visible.flatMap((p) => p.variants), [visible]);
  const changedCount = Object.keys(edits).length;

  /** Set a ₹/kg rate: every weight pack of the product is recalculated. */
  function setPerKg(product: AdminProduct, rupees: string) {
    const perKgPaise = Math.round(Number(rupees) * 100);
    if (Number.isNaN(perKgPaise)) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const v of product.variants) {
        if (v.unitType !== "weight") continue;
        next[v.id] = packPriceFromPerKg(perKgPaise, v.baseQuantity);
      }
      return next;
    });
  }

  function applyBulk() {
    const pct = Number(bulkPercent);
    if (Number.isNaN(pct) || visible.length === 0) return;
    const next: Record<string, number> = { ...edits };
    let touched = 0;
    for (const p of visible) {
      for (const v of p.variants) {
        const current = next[v.id] ?? v.pricePaise;
        next[v.id] = Math.max(0, Math.round((current * (100 + pct)) / 100));
        touched += 1;
      }
    }
    setEdits(next);
    toast.info(`Previewed ${pct > 0 ? "+" : ""}${pct}% on ${touched} packs`);
  }

  async function saveAll() {
    const updates = Object.entries(edits).map(([variantId, pricePaise]) => ({ variantId, pricePaise }));
    if (updates.length === 0) return;
    setSaving(true);
    try {
      const result = await unwrap<{ updated: number }>(
        api.api.admin.catalog["quick-price"].$post({ json: { updates } as never }),
      );
      toast.success(`${result.updated} price(s) saved — live on the storefront`);
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-ink">Quick price update</h1>
          <p className="text-sm text-muted">
            Daily market board — type one <strong>₹/kg</strong> rate and every pack size (250 g / 500 g / 1 kg
            / 2 kg) updates itself. Save once when done.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {changedCount > 0 ? <Badge tone="amber">{changedCount} unsaved change(s)</Badge> : null}
          <Button onClick={saveAll} disabled={changedCount === 0} loading={saving}>
            <Save className="h-4 w-4" aria-hidden /> Save all
          </Button>
        </div>
      </header>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="w-44">
          <label className="text-xs font-bold text-muted" htmlFor="qp-category">
            Category
          </label>
          <Select
            id="qp-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="mt-1"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("-", " ")}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-56">
          <label className="text-xs font-bold text-muted" htmlFor="qp-search">
            Search (English / മലയാളം)
          </label>
          <Input
            id="qp-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="tomato, തക്കാളി…"
            className="mt-1"
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="w-36">
            <label className="text-xs font-bold text-muted" htmlFor="qp-bulk">
              Bulk change %
            </label>
            <Input
              id="qp-bulk"
              value={bulkPercent}
              onChange={(e) => setBulkPercent(e.target.value)}
              inputMode="decimal"
              className="mt-1"
            />
          </div>
          <Button variant="secondary" onClick={applyBulk}>
            <Percent className="h-4 w-4" aria-hidden /> Preview
          </Button>
        </div>
      </Card>

      <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
        <table className="table-base">
          <thead>
            <tr>
              <th>Product</th>
              <th>₹ per kg</th>
              <th>Pack</th>
              <th>Current price</th>
              <th>New price (₹)</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) =>
              p.variants.map((v, idx) => {
                const current = edits[v.id] ?? v.pricePaise;
                const edited = edits[v.id] != null;
                const isKg = v.unitType === "weight";
                const perKg = isKg ? currentPerKg(p, edits) : null;
                return (
                  <tr key={v.id} className={idx === 0 ? "border-t-2 border-line" : ""}>
                    {idx === 0 ? (
                      <td rowSpan={p.variants.length} className="align-top font-semibold text-ink">
                        {p.nameEn}
                        <span className="block text-xs font-normal text-muted">{p.nameMl}</span>
                      </td>
                    ) : null}
                    {idx === 0 ? (
                      <td rowSpan={p.variants.length} className="align-top">
                        {isKg && perKg != null ? (
                          <Input
                            className="w-24 py-1 font-bold"
                            inputMode="decimal"
                            defaultValue={(perKg / 100).toFixed(0)}
                            key={`${p.id}-${perKg}`}
                            aria-label={`Price per kg for ${p.nameEn}`}
                            onBlur={(e) => {
                              if (e.target.value.trim() === "") return;
                              setPerKg(p, e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                          />
                        ) : (
                          <span className="text-xs text-muted">pack</span>
                        )}
                      </td>
                    ) : null}
                    <td className="text-muted">{v.labelEn}</td>
                    <td>
                      <Money
                        paise={v.pricePaise}
                        className={edited ? "text-muted line-through" : "font-bold"}
                      />
                    </td>
                    <td>
                      <Input
                        className="w-24 py-1"
                        inputMode="decimal"
                        value={(current / 100).toFixed(2)}
                        aria-label={`New price for ${p.nameEn} ${v.labelEn}`}
                        onChange={(e) => {
                          const paise = Math.round(Number(e.target.value) * 100);
                          if (Number.isNaN(paise)) return;
                          setEdits((prev) => ({ ...prev, [v.id]: Math.max(0, paise) }));
                        }}
                      />
                    </td>
                    <td>
                      {edited ? (
                        <Badge tone={current < v.pricePaise ? "green" : "amber"}>
                          {formatINR(current - v.pricePaise)}
                        </Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted">
                  No products match the filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        {variantRows.length} packs across {visible.length} products shown. Saving records an audit entry (who
        changed what) and updates the storefront immediately.
      </p>
    </div>
  );
}
