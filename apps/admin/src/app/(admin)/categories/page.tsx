"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Input } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";

interface AdminCategory {
  id: string;
  slug: string;
  nameEn: string;
  nameMl: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}
const empty = { slug: "", nameEn: "", nameMl: "", description: "", imageUrl: "", sortOrder: 0 };

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [form, setForm] = useState(empty);
  const categories = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => unwrap<AdminCategory[]>(api.api.admin.categories.$get()),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
  const save = useMutation({
    mutationFn: async () => {
      const json = {
        ...form,
        nameMl: form.nameMl.trim() || form.nameEn.trim(),
        slug:
          form.slug ||
          form.nameEn
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
        description: form.description || null,
        imageUrl: form.imageUrl || null,
        isActive: editing?.isActive ?? true,
      };
      return unwrap(
        editing
          ? api.api.admin.categories[":id"].$patch({ param: { id: editing.id }, json })
          : api.api.admin.categories.$post({ json }),
      );
    },
    onSuccess: () => {
      toast.success(editing ? "Category updated" : "Category created");
      setEditing(null);
      setForm(empty);
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const toggle = useMutation({
    mutationFn: (c: AdminCategory) =>
      unwrap(
        api.api.admin.categories[":id"].$patch({ param: { id: c.id }, json: { isActive: !c.isActive } }),
      ),
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.api.admin.categories[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      toast.success("Category deleted");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function edit(c: AdminCategory) {
    setEditing(c);
    setForm({ ...c, description: c.description ?? "", imageUrl: c.imageUrl ?? "" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold text-ink">Categories</h1>
      <p className="text-sm text-muted">
        Create and rename sections for vegetables, groceries and any other items you sell.
      </p>
      <Card className="p-4">
        <form
          ref={formRef}
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Name (EN)">
            <Input
              required
              minLength={2}
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
          <Field label="Name (ML)" hint="Optional; uses the English name if blank">
            <Input
              minLength={2}
              value={form.nameMl}
              onChange={(e) => setForm({ ...form, nameMl: e.target.value })}
            />
          </Field>
          <Field label="Slug" hint="Generated from English name if blank">
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </Field>
          <Field label="Description">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Image URL (optional)">
            <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
          </Field>
          <Field label="Sort order">
            <Input
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </Field>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" loading={save.isPending}>
              <Plus className="h-4 w-4" />
              {editing ? "Save category" : "Add category"}
            </Button>
            {editing ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setForm(empty);
                }}
              >
                Cancel edit
              </Button>
            ) : null}
          </div>
        </form>
      </Card>
      {categories.error ? <Alert tone="warning">{categories.error.message}</Alert> : null}
      <div className="space-y-3 md:hidden">
        {(categories.data ?? []).map((c) => (
          <Card key={c.id} className="p-4" aria-label={c.nameEn}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="break-words font-bold">{c.nameEn}</h2>
                <p className="text-xs text-muted">{c.nameMl}</p>
              </div>
              <Badge tone={c.isActive ? "green" : "neutral"}>{c.isActive ? "Active" : "Hidden"}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => edit(c)} aria-label={`Edit ${c.nameEn}`}>
                <Pencil className="h-4 w-4" />
                Rename / edit
              </Button>
              <Button
                variant="ghost"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate(c)}
                aria-label={`${c.isActive ? "Hide" : "Show"} ${c.nameEn}`}
              >
                {c.isActive ? "Hide" : "Show"}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete ${c.nameEn}`}
                onClick={() => {
                  if (window.confirm(`Delete ${c.nameEn}?`)) remove.mutate(c.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-card border border-line bg-white md:block">
        <table className="table-base">
          <thead>
            <tr>
              <th>Sort</th>
              <th>Category</th>
              <th>Malayalam</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.isLoading ? (
              <tr>
                <td colSpan={5}>Loading categories…</td>
              </tr>
            ) : !categories.data?.length ? (
              <tr>
                <td colSpan={5}>Add your first category above.</td>
              </tr>
            ) : (
              categories.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.sortOrder}</td>
                  <td>
                    <p className="font-bold">{c.nameEn}</p>
                    <p className="text-xs text-muted">{c.slug}</p>
                  </td>
                  <td>{c.nameMl}</td>
                  <td>
                    <button
                      type="button"
                      disabled={toggle.isPending}
                      aria-label={`${c.isActive ? "Hide" : "Show"} ${c.nameEn}`}
                      onClick={() => toggle.mutate(c)}
                    >
                      <Badge tone={c.isActive ? "green" : "neutral"}>
                        {c.isActive ? "Active" : "Hidden"}
                      </Badge>
                    </button>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${c.nameEn}`}
                        onClick={() => edit(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${c.nameEn}`}
                        onClick={() => {
                          if (window.confirm(`Delete ${c.nameEn}?`)) remove.mutate(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
