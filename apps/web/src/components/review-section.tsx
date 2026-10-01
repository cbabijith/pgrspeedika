"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { z } from "zod";
import { Badge, Button, Card, Field, Textarea, Input } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";
import { useSession } from "@/lib/hooks";
import { useUIStore } from "@/store/ui";

interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  replyBody: string | null;
  authorName: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

const reviewFormSchema = z.object({
  rating: z.number().int().min(1, "Pick a star rating").max(5),
  title: z.string().max(120),
  body: z.string().min(4, "Write a few words").max(2000),
});
type ReviewFormValues = z.infer<typeof reviewFormSchema>;

/** Product reviews: public list + signed-in submission (React Hook Form + Zod). */
export function ReviewSection({ productId, productSlug }: { productId: string; productSlug: string }) {
  const queryClient = useQueryClient();
  const session = useSession();
  const user = session.data?.user ?? null;
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);

  const reviews = useQuery({
    queryKey: ["product-reviews", productSlug],
    queryFn: () =>
      unwrap<PublicReview[]>(
        api.api.catalog.products[":slug"].reviews.$get({ param: { slug: productSlug } }),
      ),
  });

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: { rating: 5, title: "", body: "" },
  });
  const rating = form.watch("rating");

  const submit = useMutation({
    mutationFn: async (values: ReviewFormValues) => {
      if (!user) throw new Error(t("Please log in to review", "റിവ്യൂ ചെയ്യാൻ ലോഗിൻ ചെയ്യുക"));
      await unwrap(
        api.api.reviews.$post({
          json: {
            productId,
            rating: values.rating,
            title: values.title || null,
            body: values.body,
          } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success(
        t("Thank you! Your review is pending approval.", "നന്ദി! റിവ്യൂ അംഗീകാരത്തിന് കാത്തിരിക്കുന്നു."),
      );
      form.reset({ rating: 5, title: "", body: "" });
      queryClient.invalidateQueries({ queryKey: ["product-reviews", productSlug] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-base font-bold text-ink">{t("Customer reviews", "ഉപഭോക്തൃ റിവ്യൂകൾ")}</h2>

      {(reviews.data ?? []).length === 0 ? (
        <p className="text-sm text-muted">
          {t("No reviews yet — be the first!", "റിവ്യൂകളില്ല — ആദ്യത്തെ ആളാകൂ!")}
        </p>
      ) : (
        <ul className="mb-5 space-y-4">
          {(reviews.data ?? []).map((r) => (
            <li key={r.id} className="border-b border-line pb-4 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden className="text-sm">
                  {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)}
                </span>
                <span className="text-sm font-bold text-ink">{r.authorName}</span>
                {r.verifiedPurchase ? (
                  <Badge tone="green">{t("Verified purchase", "ഉറപ്പുള്ള വാങ്ങൽ")}</Badge>
                ) : null}
                <span className="text-xs text-muted">
                  {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </div>
              {r.title ? <p className="mt-1 text-sm font-bold text-ink">{r.title}</p> : null}
              <p className="text-sm text-muted">{r.body}</p>
              {r.replyBody ? (
                <p className="mt-2 rounded-xl bg-primary-50 p-3 text-xs text-primary-800">
                  <strong>PGRS Peedika:</strong> {r.replyBody}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-3 border-t border-line pt-4"
        onSubmit={form.handleSubmit((values) => submit.mutate(values))}
        noValidate
      >
        <p className="text-sm font-bold text-ink">{t("Write a review", "റിവ്യൂ എഴുതുക")}</p>
        <fieldset>
          <legend className="sr-only">Rating</legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                aria-pressed={rating === n}
                onClick={() => form.setValue("rating", n, { shouldValidate: true })}
                className="p-0.5"
              >
                <Star
                  className={n <= rating ? "h-6 w-6 fill-accent text-accent" : "h-6 w-6 text-line"}
                  aria-hidden
                />
              </button>
            ))}
          </div>
        </fieldset>
        <Field
          label={t("Title (optional)", "തലക്കെട്ട് (ഓപ്ഷണൽ)")}
          error={form.formState.errors.title?.message}
        >
          <Input id="review-title" maxLength={120} {...form.register("title")} />
        </Field>
        <Field label={t("Your review", "നിങ്ങളുടെ അഭിപ്രായം")} error={form.formState.errors.body?.message}>
          <Textarea id="review-body" maxLength={2000} {...form.register("body")} />
        </Field>
        <Button type="submit" loading={submit.isPending}>
          {t("Submit review", "റിവ്യൂ സമർപ്പിക്കുക")}
        </Button>
      </form>
    </Card>
  );
}
