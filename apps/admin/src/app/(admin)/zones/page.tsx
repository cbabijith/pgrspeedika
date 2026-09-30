"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge, Button, Card, Field, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@pgrs/ui";
import { formatMinutes, formatINR } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";

interface Zone {
  id: string;
  pincode: string;
  areaNameEn: string;
  areaNameMl: string;
  minOrderPaise: number;
  deliveryFeePaise: number;
  freeDeliveryThresholdPaise: number | null;
  isActive: boolean;
}

interface Slot {
  id: string;
  nameEn: string;
  nameMl: string;
  startMinutes: number;
  endMinutes: number;
  cutoffMinutes: number;
  capacity: number;
  isActive: boolean;
}

export default function ZonesPage() {
  const queryClient = useQueryClient();
  const zones = useQuery({
    queryKey: ["admin-zones"],
    queryFn: () => unwrap<Zone[]>(api.api.admin.zones.$get({ query: {} })),
  });
  const slots = useQuery({
    queryKey: ["admin-slots"],
    queryFn: () =>
      unwrap<{ slots: Slot[]; bookings: Array<{ slotId: string; date: string; bookedCount: number }> }>(
        api.api.admin.slots.$get({ query: {} }),
      ),
  });

  const [zoneForm, setZoneForm] = useState({
    pincode: "",
    areaNameEn: "",
    areaNameMl: "",
    minOrder: "99",
    deliveryFee: "29",
    freeAbove: "499",
  });
  const [slotForm, setSlotForm] = useState({
    nameEn: "Noon 12–2 PM",
    nameMl: "ഉച്ച 12–2",
    start: "12:00",
    end: "14:00",
    cutoffHours: "6",
    capacity: "40",
  });

  const createZone = useMutation({
    mutationFn: async () => {
      await unwrap(
        api.api.admin.zones.$post({
          json: {
            pincode: zoneForm.pincode,
            areaNameEn: zoneForm.areaNameEn,
            areaNameMl: zoneForm.areaNameMl,
            minOrderPaise: Math.round(Number(zoneForm.minOrder) * 100),
            deliveryFeePaise: Math.round(Number(zoneForm.deliveryFee) * 100),
            freeDeliveryThresholdPaise: Math.round(Number(zoneForm.freeAbove) * 100),
            isActive: true,
          } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Zone added");
      queryClient.invalidateQueries({ queryKey: ["admin-zones"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const createSlot = useMutation({
    mutationFn: async () => {
      const toMinutes = (hhmm: string) => {
        const [h, m] = hhmm.split(":").map(Number);
        return (h ?? 0) * 60 + (m ?? 0);
      };
      await unwrap(
        api.api.admin.slots.$post({
          json: {
            nameEn: slotForm.nameEn,
            nameMl: slotForm.nameMl,
            startMinutes: toMinutes(slotForm.start),
            endMinutes: toMinutes(slotForm.end),
            cutoffMinutes: (Number(slotForm.cutoffHours) || 0) * 60,
            capacity: Number(slotForm.capacity) || 50,
            isActive: true,
            sortOrder: 10,
          } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Slot added");
      queryClient.invalidateQueries({ queryKey: ["admin-slots"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Zones & slots</h1>

      <Tabs defaultValue="zones">
        <TabsList>
          <TabsTrigger value="zones">Delivery zones</TabsTrigger>
          <TabsTrigger value="slots">Slots</TabsTrigger>
        </TabsList>

        <TabsContent value="zones" className="space-y-4">
          <Card className="grid gap-3 p-4 sm:grid-cols-6 sm:items-end">
            <Field label="Pincode">
              <Input
                inputMode="numeric"
                value={zoneForm.pincode}
                onChange={(e) =>
                  setZoneForm({ ...zoneForm, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })
                }
              />
            </Field>
            <Field label="Area (EN)">
              <Input
                value={zoneForm.areaNameEn}
                onChange={(e) => setZoneForm({ ...zoneForm, areaNameEn: e.target.value })}
              />
            </Field>
            <Field label="Area (ML)">
              <Input
                value={zoneForm.areaNameMl}
                onChange={(e) => setZoneForm({ ...zoneForm, areaNameMl: e.target.value })}
              />
            </Field>
            <Field label="Min order ₹">
              <Input
                inputMode="decimal"
                value={zoneForm.minOrder}
                onChange={(e) => setZoneForm({ ...zoneForm, minOrder: e.target.value })}
              />
            </Field>
            <Field label="Fee ₹">
              <Input
                inputMode="decimal"
                value={zoneForm.deliveryFee}
                onChange={(e) => setZoneForm({ ...zoneForm, deliveryFee: e.target.value })}
              />
            </Field>
            <Button onClick={() => createZone.mutate()} loading={createZone.isPending}>
              <Plus className="h-4 w-4" aria-hidden /> Add zone
            </Button>
          </Card>

          <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Pincode</th>
                  <th>Area</th>
                  <th>Min order</th>
                  <th>Fee</th>
                  <th>Free above</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(zones.data ?? []).map((z) => (
                  <tr key={z.id}>
                    <td className="font-mono font-bold">{z.pincode}</td>
                    <td className="font-semibold text-ink">
                      {z.areaNameEn} <span className="text-xs text-muted">{z.areaNameMl}</span>
                    </td>
                    <td>
                      <Badge tone="outline">{formatINR(z.minOrderPaise)}</Badge>
                    </td>
                    <td>{formatINR(z.deliveryFeePaise)}</td>
                    <td>{z.freeDeliveryThresholdPaise ? formatINR(z.freeDeliveryThresholdPaise) : "—"}</td>
                    <td>
                      {z.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Paused</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="slots" className="space-y-4">
          <Card className="grid gap-3 p-4 sm:grid-cols-6 sm:items-end">
            <Field label="Name (EN)">
              <Input
                value={slotForm.nameEn}
                onChange={(e) => setSlotForm({ ...slotForm, nameEn: e.target.value })}
              />
            </Field>
            <Field label="Name (ML)">
              <Input
                value={slotForm.nameMl}
                onChange={(e) => setSlotForm({ ...slotForm, nameMl: e.target.value })}
              />
            </Field>
            <Field label="Start">
              <Input
                type="time"
                value={slotForm.start}
                onChange={(e) => setSlotForm({ ...slotForm, start: e.target.value })}
              />
            </Field>
            <Field label="End">
              <Input
                type="time"
                value={slotForm.end}
                onChange={(e) => setSlotForm({ ...slotForm, end: e.target.value })}
              />
            </Field>
            <Field label="Cutoff (hours before)">
              <Input
                inputMode="numeric"
                value={slotForm.cutoffHours}
                onChange={(e) => setSlotForm({ ...slotForm, cutoffHours: e.target.value })}
              />
            </Field>
            <Button onClick={() => createSlot.mutate()} loading={createSlot.isPending}>
              <Plus className="h-4 w-4" aria-hidden /> Add slot
            </Button>
          </Card>

          <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>Window</th>
                  <th>Cutoff</th>
                  <th>Capacity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(slots.data?.slots ?? []).map((s) => (
                  <tr key={s.id}>
                    <td className="font-semibold text-ink">
                      {s.nameEn} <span className="text-xs text-muted">{s.nameMl}</span>
                    </td>
                    <td>
                      {formatMinutes(s.startMinutes)} – {formatMinutes(s.endMinutes)}
                    </td>
                    <td className="text-muted">{Math.round(s.cutoffMinutes / 60)} h before start</td>
                    <td className="tabular-nums">{s.capacity}</td>
                    <td>
                      {s.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Paused</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
