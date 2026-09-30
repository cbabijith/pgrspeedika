"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field, Input } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";

interface Banner {
  id: string;
  titleEn: string;
  titleMl: string;
  subtitleEn: string | null;
  imageUrl: string;
  linkUrl: string | null;
  badge: string | null;
  sortOrder: number;
  isActive: boolean;
}

export default function BannersPage() {
  const queryClient = useQueryClient();
  const banners = useQuery({
    queryKey: ["admin-banners"],
    queryFn: () => unwrap<Banner[]>(api.api.admin.banners.$get({ query: {} })),
  });

  const [form, setForm] = useState({
    titleEn: "",
    titleMl: "",
    subtitleEn: "",
    imageUrl: "/media/banner/new.svg?n=New%20Arrivals",
    linkUrl: "/",
    badge: "",
    sortOrder: 10,
  });

  const create = useMutation({
    mutationFn: async () => {
      await unwrap(
        api.api.admin.banners.$post({
          json: {
            titleEn: form.titleEn,
            titleMl: form.titleMl,
            subtitleEn: form.subtitleEn || null,
            subtitleMl: null,
            imageUrl: form.imageUrl,
            linkUrl: form.linkUrl || null,
            badge: form.badge || null,
            sortOrder: form.sortOrder,
            isActive: true,
          } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Banner added");
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await unwrap(api.api.admin.banners[":id"].$delete({ param: { id } }));
    },
    onSuccess: () => {
      toast.success("Banner removed");
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Banners</h1>

      <Card className="grid gap-3 p-4 md:grid-cols-4 md:items-end">
        <Field label="Title (EN)">
          <Input value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
        </Field>
        <Field label="Title (ML)">
          <Input value={form.titleMl} onChange={(e) => setForm({ ...form, titleMl: e.target.value })} />
        </Field>
        <Field label="Subtitle (EN)">
          <Input value={form.subtitleEn} onChange={(e) => setForm({ ...form, subtitleEn: e.target.value })} />
        </Field>
        <Field label="Image URL" hint="Upload first, then paste the URL here">
          <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
        </Field>
        <Field label="Link URL">
          <Input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} />
        </Field>
        <Field label="Badge (optional)">
          <Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} />
        </Field>
        <Field label="Sort order">
          <Input
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
          />
        </Field>
        <Button onClick={() => create.mutate()} loading={create.isPending}>
          <Plus className="h-4 w-4" aria-hidden /> Add banner
        </Button>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(banners.data ?? []).map((b) => (
          <Card key={b.id} className="overflow-hidden">
            <img src={b.imageUrl} alt={b.titleEn} className="aspect-[21/8] w-full object-cover" />
            <div className="flex items-start justify-between gap-2 p-4">
              <div>
                <p className="text-sm font-bold text-ink">{b.titleEn}</p>
                <p className="text-xs text-muted">
                  {b.titleMl} · /{b.linkUrl ?? ""} · order {b.sortOrder}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {b.isActive ? <Badge tone="green">Live</Badge> : <Badge tone="neutral">Hidden</Badge>}
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete banner"
                  onClick={() => {
                    if (window.confirm("Delete this banner?")) remove.mutate(b.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
