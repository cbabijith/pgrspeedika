import { z } from "zod";
import { ERROR_CODES } from "../constants";

export const uuidSchema = z.string().uuid();

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  code: z.nativeEnum(ERROR_CODES),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiOkSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ ok: z.literal(true), data });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}
export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/** Indian mobile number in E.164 (+91XXXXXXXXXX). */
export const phoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, "Enter a valid Indian mobile number with country code (+91)");

/** Accepts +91…, 91… or bare 10-digit and normalizes to +91XXXXXXXXXX. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) {
    throw new Error("Invalid Indian mobile number");
  }
  return `+91${ten}`;
}

export const pincodeSchema = z.string().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode");
