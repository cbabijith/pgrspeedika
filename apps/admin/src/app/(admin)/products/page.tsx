"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Pencil, Plus, Trash2, Upload, Download } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
  Money,
  Select,
  Textarea,
} from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";
import { DataTable } from "@/components/data-table";

interface AdminVariant {
  id: string;
  sku: string;
  unitType: "weight" | "unit";
  baseQuantity: number;
  labelEn: string;
  labelMl: string;
  pricePaise: number;
  mrpPaise: number | null;
  stepQuantity: number;
  isActive: boolean;
}

interface AdminProduct {
  id: string;
  slug: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  nameEn: string;
  nameMl: string;
  description: string | null;
  brand: string | null;
  hsnCode: string;
  gstRate: number;
  sellingType: "loose" | "packaged";
  isFreshToday: boolean;
  isActive: boolean;
  stockQuantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  variants: AdminVariant[];
}

interface AdminCategory {
  id: string;
  slug: string;
  nameEn: string;
  nameMl: string;
  sortOrder: number;
  isActive: boolean;
}

const emptyForm = {
  slug: "",
  categoryId: "",
  nameEn: "",
  nameMl: "",
  description: "",
  brand: "",
  hsnCode: "",
  gstRate: 0,
  sellingType: "loose" as "loose" | "packaged",
  isFreshToday: false,
  isActive: true,
  lowStockThreshold: 5,
  initialStock: 25,
  variantLabelEn: "250 g",
  variantLabelMl: "250 ഗ്രാം",
  variantUnitType: "weight" as "weight" | "unit",
  variantBaseQuantity: 250,
  variantPrice: "30.00",
};

export default function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const products = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => unwrap<AdminProduct[]>(api.api.admin.products.$get({ query: {} })),
  });
  const categories = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => unwrap<AdminCategory[]>(api.api.admin.categories.$get({ query: {} })),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-products"] });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await unwrap(api.api.admin.products[":id"].$delete({ param: { id } }));
    },
    onSuccess: () => {
      toast.success("Product deleted");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const duplicate = useMutation({
    mutationFn: async (id: string) => {
      await unwrap(api.api.admin.products[":id"].duplicate.$post({ param: { id } }));
    },
    onSuccess: () => {
      toast.success("Duplicated (inactive) — edit and enable it");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, categoryId: categories.data?.[0]?.id ?? "" });
    setDialogOpen(true);
  }

  function openEdit(p: AdminProduct) {
    const v = p.variants[0];
    setEditing(p);
    setForm({
      slug: p.slug,
      categoryId: p.categoryId,
      nameEn: p.nameEn,
      nameMl: p.nameMl,
      description: p.description ?? "",
      brand: p.brand ?? "",
      hsnCode: p.hsnCode,
      gstRate: p.gstRate,
      sellingType: p.sellingType,
      isFreshToday: p.isFreshToday,
      isActive: p.isActive,
      lowStockThreshold: p.lowStockThreshold,
      initialStock: 0,
      variantLabelEn: v?.labelEn ?? "250 g",
      variantLabelMl: v?.labelMl ?? "250 ഗ്രാം",
      variantUnitType: v?.unitType ?? "weight",
      variantBaseQuantity: v?.baseQuantity ?? 250,
      variantPrice: ((v?.pricePaise ?? 0) / 100).toFixed(2),
    });
    setDialogOpen(true);
  }

  async function save() {
    const pricePaise = Math.round(Number(form.variantPrice) * 100);
    if (!form.slug || !form.categoryId || !form.nameEn || !form.nameMl || Number.isNaN(pricePaise)) {
      toast.error("Fill slug, category, both names and the variant price");
      return;
    }
    const payload = {
      slug: form.slug,
      categoryId: form.categoryId,
      nameEn: form.nameEn,
      nameMl: form.nameMl,
      description: form.description || null,
      brand: form.brand || null,
      hsnCode: form.hsnCode,
      gstRate: form.gstRate,
      sellingType: form.sellingType,
      isFreshToday: form.isFreshToday,
      isActive: form.isActive,
      lowStockThreshold: form.lowStockThreshold,
      ...(editing ? {} : { initialStock: form.initialStock }),
      variants: [
        {
          unitType: form.variantUnitType,
          baseQuantity: form.variantBaseQuantity,
          labelEn: form.variantLabelEn,
          labelMl: form.variantLabelMl,
          pricePaise,
          stepQuantity: form.variantUnitType === "weight" ? 250 : 1,
          isActive: true,
        },
        ...(editing ? editing.variants.slice(1) : []),
      ],
    } as never;
    try {
      if (editing) {
        await unwrap(api.api.admin.products[":id"].$patch({ param: { id: editing.id }, json: payload }));
        toast.success("Product updated");
      } else {
        await unwrap(api.api.admin.products.$post({ json: payload }));
        toast.success("Product created");
      }
      setDialogOpen(false);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (products.data ?? []).filter(
      (p) =>
        !q ||
        p.nameEn.toLowerCase().includes(q) ||
        p.nameMl.includes(search) ||
        p.slug.includes(q) ||
        p.categorySlug.includes(q),
    );
  }, [products.data, search]);

  const columns = useMemo<ColumnDef<AdminProduct, unknown>[]>(
    () => [
      {
        header: "Product",
        accessorKey: "nameEn",
        cell: ({ row }) => (
          <div>
            <p className="font-bold text-ink">
              {row.original.nameEn} {row.original.isFreshToday ? "🌱" : ""}
            </p>
            <p className="text-xs text-muted">
              {row.original.nameMl} · {row.original.slug}
            </p>
          </div>
        ),
      },
      { header: "Category", accessorKey: "categoryName" },
      {
        header: "Prices",
        cell: ({ row }) => (
          <span className="flex flex-col">
            {row.original.variants.slice(0, 3).map((v) => (
              <span key={v.id} className="text-xs">
                {v.labelEn}: <Money paise={v.pricePaise} className="font-bold" />
              </span>
            ))}
          </span>
        ),
      },
      {
        header: "Stock",
        cell: ({ row }) => (
          <span
            className={
              row.original.stockQuantity - row.original.reservedQuantity <= row.original.lowStockThreshold
                ? "font-bold text-danger"
                : ""
            }
          >
            {row.original.sellingType === "loose"
              ? `${((row.original.stockQuantity - row.original.reservedQuantity) / 1000).toFixed(1)} kg`
              : `${row.original.stockQuantity - row.original.reservedQuantity} u`}
          </span>
        ),
      },
      {
        header: "Status",
        cell: ({ row }) =>
          row.original.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Hidden</Badge>,
      },
      {
        header: "Actions",
        cell: ({ row }) => (
          <span className="flex gap-1">
            <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => openEdit(row.original)}>
              <Pencil className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Duplicate"
              onClick={() => duplicate.mutate(row.original.id)}
            >
              <Copy className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete"
              onClick={() => {
                if (window.confirm(`Delete ${row.original.nameEn}?`)) remove.mutate(row.original.id);
              }}
            >
              <Trash2 className="h-4 w-4 text-danger" aria-hidden />
            </Button>
          </span>
        ),
      },
    ],
    [duplicate, remove, products.data],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Products</h1>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL}/api/admin/catalog/export.csv`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline">
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </Button>
          </a>
          <Link href="/products/import">
            <Button variant="outline">
              <Upload className="h-4 w-4" aria-hidden /> Import CSV
            </Button>
          </Link>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden /> New product
          </Button>
        </div>
      </header>

      <Input
        placeholder="Search products…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
        aria-label="Search products"
      />

      <DataTable data={filtered} columns={columns} emptyMessage="No products match." />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <span className="hidden" />
        </DialogTrigger>
        <DialogContent
          title={editing ? `Edit ${editing.nameEn}` : "New product"}
          description="Bilingual names, GST/HSN and pack variants."
          className="w-[min(96vw,760px)]"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Slug" hint="lowercase-with-dashes">
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </Field>
            <Field label="Category">
              <Select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameEn}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name (English)">
              <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
            </Field>
            <Field label="Name (Malayalam)">
              <Input value={form.nameMl} onChange={(e) => setForm({ ...form, nameMl: e.target.value })} />
            </Field>
            <Field label="Brand (optional)">
              <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </Field>
            <Field label="HSN code">
              <Input value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
            </Field>
            <Field label="GST rate">
              <Select
                value={String(form.gstRate)}
                onChange={(e) => setForm({ ...form, gstRate: Number(e.target.value) })}
              >
                {[0, 5, 12, 18, 28].map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Selling type">
              <Select
                value={form.sellingType}
                onChange={(e) => setForm({ ...form, sellingType: e.target.value as "loose" | "packaged" })}
              >
                <option value="loose">loose (by weight)</option>
                <option value="packaged">packaged</option>
              </Select>
            </Field>
          </div>
          <Field label="Description" className="mt-1">
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <Card className="mt-3 space-y-3 p-4">
            <p className="text-sm font-bold text-ink">First variant</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Label (EN)">
                <Input
                  value={form.variantLabelEn}
                  onChange={(e) => setForm({ ...form, variantLabelEn: e.target.value })}
                />
              </Field>
              <Field label="Label (ML)">
                <Input
                  value={form.variantLabelMl}
                  onChange={(e) => setForm({ ...form, variantLabelMl: e.target.value })}
                />
              </Field>
              <Field label="Price (₹)">
                <Input
                  inputMode="decimal"
                  value={form.variantPrice}
                  onChange={(e) => setForm({ ...form, variantPrice: e.target.value })}
                />
              </Field>
              <Field label="Unit type">
                <Select
                  value={form.variantUnitType}
                  onChange={(e) => setForm({ ...form, variantUnitType: e.target.value as "weight" | "unit" })}
                >
                  <option value="weight">weight (grams)</option>
                  <option value="unit">unit (pieces)</option>
                </Select>
              </Field>
              <Field label={form.variantUnitType === "weight" ? "Grams per pack" : "Units per pack"}>
                <Input
                  inputMode="numeric"
                  value={form.variantBaseQuantity}
                  onChange={(e) => setForm({ ...form, variantBaseQuantity: Number(e.target.value) || 0 })}
                />
              </Field>
              {!editing ? (
                <Field label="Initial stock (grams/units)">
                  <Input
                    inputMode="numeric"
                    value={form.initialStock}
                    onChange={(e) => setForm({ ...form, initialStock: Number(e.target.value) || 0 })}
                  />
                </Field>
              ) : null}
            </div>
            <p className="text-xs text-muted">
              {editing && editing.variants.length > 1
                ? `${editing.variants.length - 1} additional variant(s) are preserved unchanged.`
                : "Add more variants after saving, or duplicate this product."}
            </p>
          </Card>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={form.isFreshToday}
                  onChange={(e) => setForm({ ...form, isFreshToday: e.target.checked })}
                />
                Fresh today
              </label>
              <label className="inline-flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
            <Button onClick={save}>{editing ? "Save changes" : "Create product"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
