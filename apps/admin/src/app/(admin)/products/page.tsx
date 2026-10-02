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
import { API_URL, api, unwrap } from "@/lib/api";
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
  imageUrl: string | null;
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
  imageUrl: "",
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
  lowStockThreshold: 5000,
  initialStock: 25000,
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
      imageUrl: p.imageUrl ?? "",
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

  const [saving, setSaving] = useState(false);

  async function save() {
    const pricePaise = Math.round(Number(form.variantPrice) * 100);
    const slug =
      form.slug ||
      form.nameEn
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    if (!slug || !form.categoryId || !form.nameEn.trim() || !Number.isFinite(pricePaise) || pricePaise < 0) {
      toast.error("Fill the product name, category and a valid price");
      return;
    }
    const payload = {
      slug,
      categoryId: form.categoryId,
      nameEn: form.nameEn,
      nameMl: form.nameMl.trim() || form.nameEn.trim(),
      description: form.description || null,
      brand: form.brand || null,
      hsnCode: form.hsnCode,
      gstRate: form.gstRate,
      sellingType: form.sellingType,
      isFreshToday: form.isFreshToday,
      isActive: form.isActive,
      lowStockThreshold: form.lowStockThreshold,
      ...(editing ? {} : { initialStock: form.initialStock }),
      ...(!editing || form.imageUrl !== (editing.imageUrl ?? "")
        ? { images: form.imageUrl ? [{ url: form.imageUrl, alt: form.nameEn }] : [] }
        : {}),
      variants: [
        {
          ...(editing?.variants[0]
            ? {
                id: editing.variants[0].id,
                sku: editing.variants[0].sku,
                mrpPaise: editing.variants[0].mrpPaise,
              }
            : {}),
          unitType: form.variantUnitType,
          baseQuantity: form.variantBaseQuantity,
          labelEn: form.variantLabelEn,
          labelMl: form.variantLabelMl.trim() || form.variantLabelEn.trim(),
          pricePaise,
          stepQuantity: form.variantUnitType === "weight" ? 250 : 1,
          isActive: true,
        },
        ...(editing ? editing.variants.slice(1) : []),
      ],
    } as never;
    setSaving(true);
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
    } finally {
      setSaving(false);
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
            href={`${API_URL}/api/admin/catalog/export.csv`}
            className="hidden md:block"
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline">
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </Button>
          </a>
          <Link href="/products/import" className="hidden md:block">
            <Button variant="outline">
              <Upload className="h-4 w-4" aria-hidden /> Import CSV
            </Button>
          </Link>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden /> New product
          </Button>
        </div>
      </header>

      <div className="flex gap-2">
        <Link
          href="/quick-price"
          className="flex min-h-11 items-center rounded-xl border border-line bg-white px-4 text-sm font-bold text-primary-700"
        >
          Prices
        </Link>
        <Link
          href="/inventory"
          className="flex min-h-11 items-center rounded-xl border border-line bg-white px-4 text-sm font-bold text-primary-700"
        >
          Manage stock
        </Link>
      </div>
      <p className="text-sm text-muted">
        Vegetables, groceries and daily essentials. Edit any product to rename it or change its pack price.
      </p>
      <Input
        placeholder="Search products…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
        aria-label="Search products"
      />

      <div className="hidden md:block">
        <DataTable data={filtered} columns={columns} emptyMessage="No products match." />
      </div>
      <div className="space-y-3 md:hidden">
        {products.isLoading ? (
          <p>Loading products…</p>
        ) : products.error ? (
          <p role="alert">{products.error.message}</p>
        ) : filtered.length === 0 ? (
          <p>No products match.</p>
        ) : (
          filtered.map((p) => (
            <Card key={p.id} className="space-y-3 p-4" aria-label={p.nameEn}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="break-words text-base font-bold">{p.nameEn}</h2>
                  <p className="text-xs text-muted">
                    {p.categoryName} · {p.sellingType === "loose" ? "By weight" : "Packaged grocery"}
                  </p>
                </div>
                <Badge tone={p.isActive ? "green" : "neutral"}>{p.isActive ? "Active" : "Hidden"}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {p.variants.map((v) => (
                  <span key={v.id}>
                    {v.labelEn}: <Money paise={v.pricePaise} className="font-bold" />
                  </span>
                ))}
              </div>
              <p className="text-sm font-semibold">
                Available:{" "}
                {p.sellingType === "loose"
                  ? `${((p.stockQuantity - p.reservedQuantity) / 1000).toFixed(2)} kg`
                  : `${p.stockQuantity - p.reservedQuantity} packs`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => openEdit(p)}
                  aria-label={`Edit ${p.nameEn}`}
                >
                  <Pencil className="h-4 w-4" />
                  Edit product
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Duplicate ${p.nameEn}`}
                  onClick={() => duplicate.mutate(p.id)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${p.nameEn}`}
                  onClick={() => {
                    if (window.confirm(`Delete ${p.nameEn}?`)) remove.mutate(p.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <span className="hidden" />
        </DialogTrigger>
        <DialogContent
          title={editing ? `Edit ${editing.nameEn}` : "New product"}
          description="Sell vegetables or packaged groceries. Names and prices can be changed anytime."
          className="w-[min(96vw,760px)] p-4 sm:p-6"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Slug" hint="Generated from the English name if blank">
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
              <Input
                value={form.nameEn}
                onChange={(e) =>
                  setForm({
                    ...form,
                    nameEn: e.target.value,
                    nameMl: form.nameMl === form.nameEn ? e.target.value : form.nameMl,
                  })
                }
              />
            </Field>
            <Field label="Name (Malayalam)" hint="Optional; uses the English name if blank">
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
                disabled={Boolean(editing)}
                value={form.sellingType}
                onChange={(e) => {
                  const packaged = e.target.value === "packaged";
                  setForm({
                    ...form,
                    sellingType: packaged ? "packaged" : "loose",
                    variantUnitType: packaged ? "unit" : "weight",
                    variantBaseQuantity: packaged ? 1 : 250,
                    variantLabelEn: packaged ? "1 pack" : "250 g",
                    variantLabelMl: packaged ? "1 പാക്ക്" : "250 ഗ്രാം",
                    initialStock: packaged ? 25 : 25000,
                    lowStockThreshold: packaged ? 5 : 5000,
                  });
                }}
              >
                <option value="loose">loose (by weight)</option>
                <option value="packaged">packaged</option>
              </Select>
            </Field>
          </div>
          <Field label="Product image URL (optional)">
            <Input
              placeholder="https://… or /media/…"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />
          </Field>
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
                  disabled={Boolean(editing)}
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
                  disabled={Boolean(editing)}
                  value={form.variantBaseQuantity}
                  onChange={(e) => setForm({ ...form, variantBaseQuantity: Number(e.target.value) || 0 })}
                />
              </Field>
              {!editing ? (
                <Field label={form.sellingType === "loose" ? "Initial stock (kg)" : "Initial stock (packs)"}>
                  <Input
                    inputMode="decimal"
                    value={form.sellingType === "loose" ? form.initialStock / 1000 : form.initialStock}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        initialStock:
                          Math.round(Number(e.target.value) * (form.sellingType === "loose" ? 1000 : 1)) || 0,
                      })
                    }
                  />
                </Field>
              ) : null}
            </div>
            <p className="text-xs text-muted">
              {editing && editing.variants.length > 1
                ? `${editing.variants.length - 1} additional variant(s) are preserved unchanged.`
                : "Use Quick prices for daily price updates. Loose stock is entered in kilograms."}
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
            <Button onClick={save} loading={saving}>
              {editing ? "Save changes" : "Create product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
