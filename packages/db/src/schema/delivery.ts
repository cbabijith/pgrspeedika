import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pincode: text("pincode").notNull(),
    areaNameEn: text("area_name_en").notNull(),
    areaNameMl: text("area_name_ml").notNull().default(""),
    /** Minimum cart subtotal (paise) required to check out in this zone. */
    minOrderPaise: integer("min_order_paise").notNull().default(0),
    deliveryFeePaise: integer("delivery_fee_paise").notNull().default(0),
    /** Cart subtotal (paise) at or above which delivery becomes free. */
    freeDeliveryThresholdPaise: integer("free_delivery_threshold_paise"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("delivery_zones_pincode_unique").on(t.pincode),
    index("delivery_zones_active_idx").on(t.isActive),
  ],
);

export const deliverySlots = pgTable(
  "delivery_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nameEn: text("name_en").notNull(),
    nameMl: text("name_ml").notNull(),
    /** Slot window in minutes from midnight (e.g. 7–9 AM → 420 / 540). */
    startMinutes: integer("start_minutes").notNull(),
    endMinutes: integer("end_minutes").notNull(),
    /** Orders close this many minutes before the slot starts. */
    cutoffMinutes: integer("cutoff_minutes").notNull().default(240),
    /** Max orders per day in this slot. */
    capacity: integer("capacity").notNull().default(50),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("delivery_slots_active_idx").on(t.isActive, t.sortOrder)],
);

/** Per-date booking counters; incremented atomically on order placement. */
export const slotBookings = pgTable(
  "slot_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => deliverySlots.id, { onDelete: "cascade" }),
    bookingDate: date("booking_date", { mode: "string" }).notNull(),
    bookedCount: integer("booked_count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("slot_bookings_slot_date_unique").on(t.slotId, t.bookingDate),
    index("slot_bookings_date_idx").on(t.bookingDate),
  ],
);

export const deliverySlotsRelations = relations(deliverySlots, ({ many }) => ({
  bookings: many(slotBookings),
}));
