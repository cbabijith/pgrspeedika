"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star } from "lucide-react";
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

/** Product reviews: public list + signed-in submission (moderated). */
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

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t("Please log in to review", "റിവ്യൂ ചെയ്യാൻ ലോഗിൻ ചെയ്യുക"));
      if (body.trim().length < 4) throw new Error(t("Write a few words", "കുറച്ച് വാക്കുകൾ എഴുതുക"));
      await unwrap(
        api.api.reviews.$post({
          json: {
            productId,
            rating,
            title: title || null,
            body,
          } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success(
        t("Thank you! Your review is pending approval.", "നന്ദി! റിവ്യൂ അംഗീകാരത്തിന് കാത്തിരിക്കുന്നു."),
      );
      setTitle("");
      setBody("");
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
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
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
                onClick={() => setRating(n)}
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
        <Field label={t("Title (optional)", "തലക്കെട്ട് (ഓപ്ഷണൽ)")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </Field>
        <Field label={t("Your review", "നിങ്ങളുടെ അഭിപ്രായം")}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
        </Field>
        <Button type="submit" loading={submit.isPending}>
          {t("Submit review", "റിവ്യൂ സമർപ്പിക്കുക")}
        </Button>
      </form>
    </Card>
  );
}
