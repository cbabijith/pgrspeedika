"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Percent, Save } from "lucide-react";
import { Badge, Button, Card, Input, Money, Select } from "@pgrs/ui";
import { formatINR } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";

interface QuickVariant {
  id: string;
  productId: string;
  productName: string;
  categorySlug: string;
  labelEn: string;
  pricePaise: number;
}

interface AdminProduct {
  id: string;
  slug: string;
  nameEn: string;
  categorySlug: string;
  variants: Array<{ id: string; labelEn: string; pricePaise: number }>;
}

/** Daily price board: inline edits, bulk % change, single save with preview. */
export default function QuickPricePage() {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [bulkPercent, setBulkPercent] = useState("-5");
  const [saving, setSaving] = useState(false);

  const products = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => unwrap<AdminProduct[]>(api.api.admin.products.$get({ query: {} })),
  });

  const variants = useMemo<QuickVariant[]>(() => {
    const all: QuickVariant[] = [];
    for (const p of products.data ?? []) {
      for (const v of p.variants) {
        all.push({
          id: v.id,
          productId: p.id,
          productName: p.nameEn,
          categorySlug: p.categorySlug,
          labelEn: v.labelEn,
          pricePaise: v.pricePaise,
        });
      }
    }
    const q = search.toLowerCase();
    return all.filter(
      (v) =>
        (categoryFilter === "all" || v.categorySlug === categoryFilter) &&
        (!q || v.productName.toLowerCase().includes(q)),
    );
  }, [products.data, categoryFilter, search]);

  const categories = useMemo(() => {
    const set = new Set((products.data ?? []).map((p) => p.categorySlug));
    return [...set];
  }, [products.data]);

  const changedCount = Object.keys(edits).length;

  function applyBulk() {
    const pct = Number(bulkPercent);
    if (Number.isNaN(pct) || variants.length === 0) return;
    const next: Record<string, number> = { ...edits };
    for (const v of variants) {
      const current = next[v.id] ?? v.pricePaise;
      next[v.id] = Math.max(0, Math.round((current * (100 + pct)) / 100));
    }
    setEdits(next);
    toast.info(`Previewed ${pct > 0 ? "+" : ""}${pct}% on ${variants.length} variants`);
  }

  async function saveAll() {
    const updates = Object.entries(edits).map(([variantId, pricePaise]) => ({ variantId, pricePaise }));
    if (updates.length === 0) return;
    setSaving(true);
    try {
      const result = await unwrap<{ updated: number }>(
        api.api.admin.catalog["quick-price"].$post({ json: { updates } as never }),
      );
      toast.success(`${result.updated} price(s) saved`);
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
            Today&apos;s market rates — edit inline, apply a bulk %, then save once.
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
          <label className="text-xs font-bold text-muted">Category</label>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="mt-1">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-56">
          <label className="text-xs font-bold text-muted">Search</label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="tomato…"
            className="mt-1"
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="w-36">
            <label className="text-xs font-bold text-muted">Bulk change %</label>
            <Input
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
              <th>Pack</th>
              <th>Current price</th>
              <th>New price (₹)</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const current = edits[v.id] ?? v.pricePaise;
              const edited = edits[v.id] != null;
              return (
                <tr key={v.id}>
                  <td className="font-semibold text-ink">{v.productName}</td>
                  <td className="text-muted">{v.labelEn}</td>
                  <td>
                    <Money
                      paise={v.pricePaise}
                      className={edited ? "text-muted line-through" : "font-bold"}
                    />
                  </td>
                  <td>
                    <Input
                      className="w-28 py-1"
                      inputMode="decimal"
                      value={(current / 100).toFixed(2)}
                      aria-label={`New price for ${v.productName} ${v.labelEn}`}
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
            })}
            {variants.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-muted">
                  No variants match the filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
