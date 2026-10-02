import { and, eq, inArray } from "drizzle-orm";
import { deliveryZones } from "@pgrs/db";
import { KOTTAYAM_PINCODES } from "@pgrs/contracts";

/** Both the district boundary and the shop's enabled zones apply to every order lane. */
export function servedZoneCondition(pincode?: string) {
  return and(
    eq(deliveryZones.isActive, true),
    inArray(deliveryZones.pincode, [...KOTTAYAM_PINCODES]),
    pincode === undefined ? undefined : eq(deliveryZones.pincode, pincode),
  );
}
