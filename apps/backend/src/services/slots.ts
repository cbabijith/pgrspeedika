import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@pgrs/db";
import { deliverySlots, slotBookings } from "@pgrs/db";
import type { SlotAvailability } from "@pgrs/contracts";
import { notFound, slotUnavailable } from "../lib/errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Today's date string (YYYY-MM-DD) in Asia/Kolkata. */
export function istTodayDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function istMinutesNow(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [h, m] = parts.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Slot availability for a date (bookable = capacity left AND cutoff not passed).
 * Slots from the past part of the day are not bookable for today.
 */
export async function slotAvailabilityForDate(
  db: Database,
  date: string,
  now = new Date(),
): Promise<SlotAvailability[]> {
  const slots = await db.select().from(deliverySlots).where(eq(deliverySlots.isActive, true));
  const bookings = await db.select().from(slotBookings).where(eq(slotBookings.bookingDate, date));
  const minutesNow = istMinutesNow(now);
  const today = istTodayDateString(now);

  return slots
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((slot) => {
      const booked = bookings.find((b) => b.slotId === slot.id)?.bookedCount ?? 0;
      const cutoffPassed = date <= today && slot.startMinutes - slot.cutoffMinutes <= minutesNow;
      const remaining = Math.max(0, slot.capacity - booked);
      return {
        id: slot.id,
        nameEn: slot.nameEn,
        nameMl: slot.nameMl,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        cutoffMinutes: slot.cutoffMinutes,
        capacity: slot.capacity,
        isActive: slot.isActive,
        date,
        remaining,
        cutoffPassed,
        bookable: slot.isActive && remaining > 0 && !cutoffPassed && date >= today,
      };
    });
}

/**
 * Atomically book a slot: INSERT the counter row if absent, then increment
 * only while below capacity. Concurrent orders cannot oversell the slot.
 */
export async function bookSlot(tx: Tx, slotId: string, date: string, now = new Date()): Promise<void> {
  const [slot] = await tx.select().from(deliverySlots).where(eq(deliverySlots.id, slotId));
  if (!slot || !slot.isActive) throw notFound("Delivery slot not found");
  if (date < istTodayDateString(now)) throw slotUnavailable("This delivery date is in the past");

  const availability = await slotAvailabilityForDateUsingTx(tx, slot, date, now);
  if (!availability.bookable) {
    throw slotUnavailable(
      availability.cutoffPassed ? "Ordering for this slot has closed" : "This slot is full",
    );
  }

  await tx
    .insert(slotBookings)
    .values({ slotId, bookingDate: date, bookedCount: 0 })
    .onConflictDoNothing({ target: [slotBookings.slotId, slotBookings.bookingDate] });

  const updated = await tx
    .update(slotBookings)
    .set({ bookedCount: sql`${slotBookings.bookedCount} + 1` })
    .where(
      and(
        eq(slotBookings.slotId, slotId),
        eq(slotBookings.bookingDate, date),
        sql`${slotBookings.bookedCount} < ${slot.capacity}`,
      ),
    )
    .returning({ id: slotBookings.id });
  if (updated.length === 0) throw slotUnavailable("This slot is full");
}

async function slotAvailabilityForDateUsingTx(
  tx: Tx,
  slot: typeof deliverySlots.$inferSelect,
  date: string,
  now: Date,
) {
  const [booking] = await tx
    .select()
    .from(slotBookings)
    .where(and(eq(slotBookings.slotId, slot.id), eq(slotBookings.bookingDate, date)));
  const booked = booking?.bookedCount ?? 0;
  const minutesNow = istMinutesNow(now);
  const today = istTodayDateString(now);
  const cutoffPassed = date <= today && slot.startMinutes - slot.cutoffMinutes <= minutesNow;
  const remaining = Math.max(0, slot.capacity - booked);
  return {
    cutoffPassed,
    remaining,
    bookable: slot.isActive && remaining > 0 && !cutoffPassed && date >= today,
  };
}

/** Release a booking (order cancelled / payment failed and expired). */
export async function releaseSlot(tx: Tx, slotId: string, date: string): Promise<void> {
  await tx
    .update(slotBookings)
    .set({ bookedCount: sql`GREATEST(${slotBookings.bookedCount} - 1, 0)` })
    .where(and(eq(slotBookings.slotId, slotId), eq(slotBookings.bookingDate, date)));
}
