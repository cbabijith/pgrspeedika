"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge, Button, Card, Field, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@pgrs/ui";
import { formatMinutes, formatINR, isKottayamPincode, KOTTAYAM_PINCODES } from "@pgrs/contracts";
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

const zoneDefaults = {
  pincode: "",
  areaNameEn: "",
  areaNameMl: "",
  minOrder: "99",
  deliveryFee: "29",
  freeAbove: "499",
};

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

  const [zoneForm, setZoneForm] = useState(zoneDefaults);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [slotForm, setSlotForm] = useState({
    nameEn: "Noon 12–2 PM",
    nameMl: "ഉച്ച 12–2",
    start: "12:00",
    end: "14:00",
    cutoffHours: "6",
    capacity: "40",
  });

  const holidays = useQuery({
    queryKey: ["admin-holidays"],
    queryFn: () => unwrap<{ dates: string[] }>(api.api.admin.holidays.$get({ query: {} })),
  });
  const [holidayDate, setHolidayDate] = useState("");
  const saveHolidays = useMutation({
    mutationFn: async (dates: string[]) => {
      return unwrap<{ dates: string[] }>(api.api.admin.holidays.$put({ json: { dates } }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-holidays"] });
      toast.success("Holidays updated — slots on those dates are closed");
    },
    onError: (err) => toast.error(err.message),
  });

  const createZone = useMutation({
    mutationFn: async () => {
      const json = {
        pincode: zoneForm.pincode,
        areaNameEn: zoneForm.areaNameEn,
        areaNameMl: zoneForm.areaNameMl,
        minOrderPaise: Math.round(Number(zoneForm.minOrder) * 100),
        deliveryFeePaise: Math.round(Number(zoneForm.deliveryFee) * 100),
        freeDeliveryThresholdPaise: zoneForm.freeAbove.trim()
          ? Math.round(Number(zoneForm.freeAbove) * 100)
          : null,
      };
      if (editingZoneId) {
        await unwrap(api.api.admin.zones[":id"].$patch({ param: { id: editingZoneId }, json }));
      } else {
        await unwrap(api.api.admin.zones.$post({ json: { ...json, isActive: true } }));
      }
    },
    onSuccess: () => {
      toast.success(editingZoneId ? "Zone updated" : "Zone added");
      queryClient.invalidateQueries({ queryKey: ["admin-zones"] });
      setEditingZoneId(null);
      setZoneForm(zoneDefaults);
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

  const toggleZone = useMutation({
    mutationFn: async (zone: Zone) =>
      unwrap(
        api.api.admin.zones[":id"].$patch({ param: { id: zone.id }, json: { isActive: !zone.isActive } }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-zones"] });
      toast.success("Delivery coverage updated");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Zones & slots</h1>
      <p className="text-sm text-muted">
        Delivery is limited to Kottayam district. Enable only the pincodes you can serve; paused zones cannot
        accept new orders.
      </p>

      <Tabs defaultValue="zones">
        <TabsList>
          <TabsTrigger value="zones">Delivery zones</TabsTrigger>
          <TabsTrigger value="slots">Slots</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
        </TabsList>

        <TabsContent value="zones" className="space-y-4">
          <Card id="delivery-zone-form" className="grid gap-3 p-4 sm:grid-cols-3 sm:items-end xl:grid-cols-7">
            <Field
              label="Pincode"
              error={
                zoneForm.pincode.length === 6 && !isKottayamPincode(zoneForm.pincode)
                  ? "Enter a Kottayam district pincode"
                  : undefined
              }
            >
              <Input
                inputMode="numeric"
                placeholder="686001"
                list="kottayam-pincodes"
                value={zoneForm.pincode}
                onChange={(e) =>
                  setZoneForm({ ...zoneForm, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })
                }
              />
            </Field>
            <datalist id="kottayam-pincodes">
              {KOTTAYAM_PINCODES.map((pincode) => (
                <option key={pincode} value={pincode} />
              ))}
            </datalist>
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
            <Field label="Free delivery above ₹" hint="Leave blank to always charge the delivery fee">
              <Input
                inputMode="decimal"
                value={zoneForm.freeAbove}
                onChange={(e) => setZoneForm({ ...zoneForm, freeAbove: e.target.value })}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => createZone.mutate()}
                loading={createZone.isPending}
                disabled={!isKottayamPincode(zoneForm.pincode)}
              >
                {editingZoneId ? (
                  "Save zone"
                ) : (
                  <>
                    <Plus className="h-4 w-4" aria-hidden /> Add zone
                  </>
                )}
              </Button>
              {editingZoneId ? (
                <Button
                  variant="outline"
                  disabled={createZone.isPending}
                  onClick={() => {
                    setEditingZoneId(null);
                    setZoneForm(zoneDefaults);
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
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
                  <th>Coverage</th>
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
                      {!isKottayamPincode(z.pincode) ? (
                        <Badge tone="neutral">Outside district</Badge>
                      ) : z.isActive ? (
                        <Badge tone="green">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Paused</Badge>
                      )}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={createZone.isPending || !isKottayamPincode(z.pincode)}
                        aria-label={`Edit delivery to ${z.pincode}`}
                        onClick={() => {
                          setEditingZoneId(z.id);
                          setZoneForm({
                            pincode: z.pincode,
                            areaNameEn: z.areaNameEn,
                            areaNameMl: z.areaNameMl,
                            minOrder: String(z.minOrderPaise / 100),
                            deliveryFee: String(z.deliveryFeePaise / 100),
                            freeAbove:
                              z.freeDeliveryThresholdPaise == null
                                ? ""
                                : String(z.freeDeliveryThresholdPaise / 100),
                          });
                          document
                            .getElementById("delivery-zone-form")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggleZone.isPending || !isKottayamPincode(z.pincode)}
                        onClick={() => toggleZone.mutate(z)}
                        aria-label={`${z.isActive ? "Pause" : "Enable"} delivery to ${z.pincode}`}
                      >
                        {z.isActive ? "Pause" : "Enable"}
                      </Button>
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
        <TabsContent value="holidays" className="space-y-4">
          <Card className="p-5">
            <h2 className="text-base font-bold text-ink">Holiday / closed days</h2>
            <p className="mt-1 text-xs text-muted">
              On these dates no slot can be booked and checkout shows the date as closed. Use it for shop
              holidays and festival closures.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Add a closed date">
                <Input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-48"
                />
              </Field>
              <Button
                onClick={() => {
                  if (!holidayDate) return;
                  saveHolidays.mutate([...(holidays.data?.dates ?? []), holidayDate]);
                  setHolidayDate("");
                }}
              >
                <Plus className="h-4 w-4" aria-hidden /> Add
              </Button>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {(holidays.data?.dates ?? []).map((d) => (
                <li key={d}>
                  <button
                    type="button"
                    aria-label={`Remove ${d}`}
                    onClick={() => saveHolidays.mutate((holidays.data?.dates ?? []).filter((x) => x !== d))}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-muted px-3 py-1.5 text-xs font-bold text-ink hover:border-danger hover:text-danger"
                  >
                    {new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    ✕
                  </button>
                </li>
              ))}
              {(holidays.data?.dates ?? []).length === 0 ? (
                <li className="text-sm text-muted">No closed dates configured.</li>
              ) : null}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
