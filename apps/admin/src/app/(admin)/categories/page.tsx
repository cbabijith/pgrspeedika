"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field, Input } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";

interface AdminCategory {
  id: string;
  slug: string;
  nameEn: string;
  nameMl: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => unwrap<AdminCategory[]>(api.api.admin.categories.$get({ query: {} })),
  });
  const [form, setForm] = useState({ slug: "", nameEn: "", nameMl: "", description: "", sortOrder: 0 });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-categories"] });

  const create = useMutation({
    mutationFn: async () => {
      await unwrap(
        api.api.admin.categories.$post({
          json: {
            slug: form.slug,
            nameEn: form.nameEn,
            nameMl: form.nameMl,
            description: form.description || null,
            sortOrder: form.sortOrder,
            isActive: true,
          } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Category created");
      setForm({ slug: "", nameEn: "", nameMl: "", description: "", sortOrder: 0 });
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggle = useMutation({
    mutationFn: async (c: AdminCategory) => {
      await unwrap(
        api.api.admin.categories[":id"].$patch({
          param: { id: c.id },
          json: { isActive: !c.isActive } as never,
        }),
      );
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await unwrap(api.api.admin.categories[":id"].$delete({ param: { id } }));
    },
    onSuccess: () => {
      toast.success("Category deleted");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Categories</h1>

      <Card className="grid gap-3 p-4 sm:grid-cols-5 sm:items-end">
        <Field label="Slug">
          <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </Field>
        <Field label="Name (EN)">
          <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
        </Field>
        <Field label="Name (ML)">
          <Input value={form.nameMl} onChange={(e) => setForm({ ...form, nameMl: e.target.value })} />
        </Field>
        <Field label="Sort order">
          <Input
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
          />
        </Field>
        <Button onClick={() => create.mutate()} loading={create.isPending}>
          <Plus className="h-4 w-4" aria-hidden /> Add
        </Button>
      </Card>

      <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
        <table className="table-base">
          <thead>
            <tr>
              <th>Sort</th>
              <th>Slug</th>
              <th>English</th>
              <th>Malayalam</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(categories.data ?? []).map((c) => (
              <tr key={c.id}>
                <td className="tabular-nums">{c.sortOrder}</td>
                <td className="font-mono text-xs">{c.slug}</td>
                <td className="font-semibold text-ink">{c.nameEn}</td>
                <td>{c.nameMl}</td>
                <td>
                  <button type="button" onClick={() => toggle.mutate(c)}>
                    {c.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Hidden</Badge>}
                  </button>
                </td>
                <td>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete"
                    onClick={() => {
                      if (window.confirm(`Delete ${c.nameEn}?`)) remove.mutate(c.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
