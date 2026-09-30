import { z } from "zod";
import { uuidSchema } from "./common";

export const reviewInputSchema = z.object({
  productId: uuidSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).nullish(),
  body: z.string().min(4).max(2000),
});

export type ReviewDTO = {
  id: string;
  productId: string;
  rating: number;
  title: string | null;
  body: string;
  status: "pending" | "approved" | "hidden";
  replyBody: string | null;
  createdAt: string;
  authorName: string;
  verifiedPurchase: boolean;
};

export const reviewReplySchema = z.object({
  reply: z.string().min(1).max(1000),
});

export const wishlistToggleSchema = z.object({
  productId: uuidSchema,
});
