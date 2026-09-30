import type { StaffRole } from "./constants";

export const PERMISSIONS = [
  "catalog:manage",
  "inventory:manage",
  "orders:view",
  "orders:manage",
  "orders:pack",
  "delivery:manage",
  "customers:view",
  "customers:manage",
  "coupons:manage",
  "banners:manage",
  "reviews:moderate",
  "reports:view",
  "refunds:manage",
  "staff:manage",
  "settings:manage",
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER: Permission[] = [...PERMISSIONS];

const MANAGER: Permission[] = [
  "catalog:manage",
  "inventory:manage",
  "orders:view",
  "orders:manage",
  "orders:pack",
  "delivery:manage",
  "customers:view",
  "customers:manage",
  "coupons:manage",
  "banners:manage",
  "reviews:moderate",
  "reports:view",
  "refunds:manage",
];

const PACKER: Permission[] = ["orders:view", "orders:pack", "inventory:manage"];

const DELIVERY: Permission[] = ["orders:view", "delivery:manage"];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: OWNER,
  manager: MANAGER,
  packer: PACKER,
  delivery: DELIVERY,
};

export function roleHas(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
