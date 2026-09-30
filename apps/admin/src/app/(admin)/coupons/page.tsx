"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge, Button, Card, Field, Input, Money, Select } from "@pgrs/ui";
import { formatINR } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";

interface Coupon {
  id: string;
  code: string;
  couponType: "percent" | "flat";
  value: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  validUntil: string | null;
  firstOrderOnly: boolean;
  isActive: boolean;
}

export default function CouponsPage() {
  const queryClient = useQueryClient();
  const coupons = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: () => unwrap<Coupon[]>(api.api.admin.coupons.$get({ query: {} })),
  });

  const [form, setForm] = useState({
    code: "",
    type: "percent" as "percent" | "flat",
    value: "10",
    minOrder: "199",
    maxDiscount: "50",
    perUser: "1",
    firstOrderOnly: true,
  });

  const create = useMutation({
    mutationFn: async () => {
      await unwrap(
        api.api.admin.coupons.$post({
          json: {
            code: form.code.toUpperCase(),
            couponType: form.type,
            value: form.type === "percent" ? Number(form.value) : Math.round(Number(form.value) * 100),
            minOrderPaise: Math.round(Number(form.minOrder) * 100),
            maxDiscountPaise: form.type === "percent" ? Math.round(Number(form.maxDiscount) * 100) : null,
            perUserLimit: Number(form.perUser) || 1,
            firstOrderOnly: form.firstOrderOnly,
            isActive: true,
          } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Coupon created");
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const toggle = useMutation({
    mutationFn: async (c: Coupon) => {
      await unwrap(
        api.api.admin.coupons[":id"].$patch({
          param: { id: c.id },
          json: { isActive: !c.isActive } as never,
        }),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-coupons"] }),
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Coupons</h1>

      <Card className="grid gap-3 p-4 md:grid-cols-7 md:items-end">
        <Field label="Code">
          <Input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="Type">
          <Select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as "percent" | "flat" })}
          >
            <option value="percent">percent</option>
            <option value="flat">flat ₹</option>
          </Select>
        </Field>
        <Field label={form.type === "percent" ? "Percent" : "Amount ₹"}>
          <Input
            inputMode="decimal"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
        </Field>
        <Field label="Min order ₹">
          <Input
            inputMode="decimal"
            value={form.minOrder}
            onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
          />
        </Field>
        {form.type === "percent" ? (
          <Field label="Max discount ₹">
            <Input
              inputMode="decimal"
              value={form.maxDiscount}
              onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
            />
          </Field>
        ) : (
          <span />
        )}
        <Field label="Per-user limit">
          <Input
            inputMode="numeric"
            value={form.perUser}
            onChange={(e) => setForm({ ...form, perUser: e.target.value })}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={form.firstOrderOnly}
              onChange={(e) => setForm({ ...form, firstOrderOnly: e.target.checked })}
            />
            First order only
          </label>
          <Button onClick={() => create.mutate()} loading={create.isPending}>
            <Plus className="h-4 w-4" aria-hidden /> Add
          </Button>
        </div>
      </Card>

      <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
        <table className="table-base">
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Min order</th>
              <th>Used</th>
              <th>First order</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(coupons.data ?? []).map((c) => (
              <tr key={c.id}>
                <td className="font-mono font-extrabold text-primary-700">{c.code}</td>
                <td>
                  {c.couponType === "percent" ? (
                    <span>
                      {c.value}%
                      {c.maxDiscountPaise ? (
                        <span className="text-xs text-muted"> up to {formatINR(c.maxDiscountPaise)}</span>
                      ) : null}
                    </span>
                  ) : (
                    <Money paise={c.value} />
                  )}
                </td>
                <td>{formatINR(c.minOrderPaise)}</td>
                <td className="tabular-nums">
                  {c.usedCount}
                  {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                </td>
                <td>{c.firstOrderOnly ? <Badge tone="amber">Yes</Badge> : "—"}</td>
                <td>
                  <button type="button" onClick={() => toggle.mutate(c)}>
                    {c.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Paused</Badge>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
