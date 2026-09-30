"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Input, Select } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";

interface InventoryRow {
  productId: string;
  slug: string;
  nameEn: string;
  sellingType: "loose" | "packaged";
  stockQuantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  trackStock: boolean;
}

interface Movement {
  id: string;
  productId: string;
  movementType: string;
  quantityDelta: number;
  reason: string;
  createdAt: string;
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<InventoryRow | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [movementType, setMovementType] = useState<"purchase" | "adjustment">("purchase");

  const inventory = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: () => unwrap<InventoryRow[]>(api.api.admin.inventory.$get({ query: {} })),
  });
  const movements = useQuery({
    queryKey: ["admin-movements", selected?.productId],
    enabled: Boolean(selected),
    queryFn: () =>
      unwrap<Movement[]>(
        api.api.admin.inventory.movements.$get({
          query: { productId: selected?.productId ?? "" },
        }),
      ),
  });

  const adjust = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const value = Number(delta);
      if (Number.isNaN(value) || value === 0) throw new Error("Enter a non-zero delta");
      await unwrap(
        api.api.admin.inventory.adjust.$post({
          json: {
            productId: selected.productId,
            quantityDelta: value,
            reason: reason || (movementType === "purchase" ? "Stock purchase" : "Manual adjustment"),
            movementType,
          } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Stock updated");
      setDelta("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["admin-movements"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Inventory</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
          <table className="table-base">
            <thead>
              <tr>
                <th>Product</th>
                <th>Available</th>
                <th>Reserved</th>
                <th>Threshold</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {(inventory.data ?? []).map((row) => {
                const available = row.stockQuantity - row.reservedQuantity;
                return (
                  <tr
                    key={row.productId}
                    onClick={() => setSelected(row)}
                    className={selected?.productId === row.productId ? "bg-primary-50" : "cursor-pointer"}
                  >
                    <td className="font-semibold text-ink">{row.nameEn}</td>
                    <td className="tabular-nums font-bold">
                      {row.sellingType === "loose" ? `${(available / 1000).toFixed(1)} kg` : `${available} u`}
                    </td>
                    <td className="tabular-nums text-muted">
                      {row.sellingType === "loose"
                        ? `${(row.reservedQuantity / 1000).toFixed(1)} kg`
                        : `${row.reservedQuantity} u`}
                    </td>
                    <td className="tabular-nums text-muted">
                      {row.sellingType === "loose"
                        ? `${(row.lowStockThreshold / 1000).toFixed(1)} kg`
                        : row.lowStockThreshold}
                    </td>
                    <td>
                      {available <= 0 ? (
                        <Badge tone="red">Out</Badge>
                      ) : available <= row.lowStockThreshold ? (
                        <Badge tone="amber">Low</Badge>
                      ) : (
                        <Badge tone="green">OK</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Card className="space-y-3 p-4">
          {selected ? (
            <>
              <p className="text-sm font-bold text-ink">{selected.nameEn}</p>
              <Field
                label={`Delta (${selected.sellingType === "loose" ? "grams; e.g. 10000 = 10 kg" : "units"})`}
              >
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 10000"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                />
              </Field>
              <Field label="Type">
                <Select
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as "purchase" | "adjustment")}
                >
                  <option value="purchase">Purchase (stock in)</option>
                  <option value="adjustment">Adjustment (correction)</option>
                </Select>
              </Field>
              <Field label="Reason">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Morning market buy"
                />
              </Field>
              <Button onClick={() => adjust.mutate()} loading={adjust.isPending} className="w-full">
                Update stock
              </Button>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Recent movements</p>
                <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
                  {(movements.data ?? []).slice(0, 20).map((m) => (
                    <li key={m.id} className="flex justify-between gap-2 border-b border-line pb-1">
                      <span className="text-muted">
                        {new Date(m.createdAt).toLocaleDateString("en-IN")} · {m.movementType} · {m.reason}
                      </span>
                      <span
                        className={
                          m.quantityDelta >= 0 ? "font-bold text-primary-700" : "font-bold text-danger"
                        }
                      >
                        {m.quantityDelta > 0 ? "+" : ""}
                        {selected.sellingType === "loose"
                          ? `${(m.quantityDelta / 1000).toFixed(1)} kg`
                          : m.quantityDelta}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Select a product to adjust stock and see its history.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
