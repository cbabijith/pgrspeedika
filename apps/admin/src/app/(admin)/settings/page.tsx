"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, Card, Field, Input, Select } from "@pgrs/ui";
import type { ShopSettings } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => unwrap<ShopSettings>(api.api.admin.settings.$get({ query: {} })),
  });

  const [form, setForm] = useState<ShopSettings | null>(null);
  useEffect(() => {
    if (settings.data && !form) setForm(settings.data);
  }, [settings.data, form]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      await unwrap(api.api.admin.settings.$put({ json: form as never }));
    },
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (err) => toast.error(err.message),
  });

  if (!form) return <p className="text-sm text-muted">Loading settings…</p>;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Shop settings</h1>
      <Card className="grid gap-3 p-5 sm:grid-cols-2">
        <Field label="Shop name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Tagline">
          <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="WhatsApp">
          <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="GSTIN" hint="Shown on GST invoices">
          <Input
            value={form.gstin}
            onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input
            value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
          />
        </Field>
        <Field label="Opens">
          <Input
            type="time"
            value={form.openTime}
            onChange={(e) => setForm({ ...form, openTime: e.target.value })}
          />
        </Field>
        <Field label="Closes">
          <Input
            type="time"
            value={form.closeTime}
            onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
          />
        </Field>
        <Field label="Weekly closed day">
          <Select
            value={form.weeklyClosedDay}
            onChange={(e) =>
              setForm({ ...form, weeklyClosedDay: e.target.value as ShopSettings["weeklyClosedDay"] })
            }
          >
            {["none", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
              (d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ),
            )}
          </Select>
        </Field>
      </Card>
      <Button onClick={() => save.mutate()} loading={save.isPending}>
        Save settings
      </Button>
    </div>
  );
}
