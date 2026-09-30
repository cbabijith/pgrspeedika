"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, Input, Textarea } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";

interface ReviewRow {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  userId: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  status: "pending" | "approved" | "hidden";
  replyBody: string | null;
  verifiedPurchase: boolean;
  createdAt: string;
}

export default function ReviewsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const reviews = useQuery({
    queryKey: ["admin-reviews", status],
    queryFn: () => unwrap<ReviewRow[]>(api.api.admin.reviews.$get({ query: { status } })),
  });

  const moderate = useMutation({
    mutationFn: async (input: { id: string; status: "approved" | "hidden" | "pending" }) => {
      await unwrap(
        api.api.admin.reviews[":id"].moderate.$post({
          param: { id: input.id },
          json: { status: input.status } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Review updated");
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const reply = useMutation({
    mutationFn: async (id: string) => {
      await unwrap(
        api.api.admin.reviews[":id"].reply.$post({
          param: { id },
          json: { reply: replyText } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Reply posted");
      setReplyFor(null);
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Reviews</h1>
        <div className="flex gap-1.5">
          {["pending", "approved", "hidden"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={
                status === s
                  ? "rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-white"
                  : "rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-muted"
              }
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      {(reviews.data ?? []).length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">No {status} reviews.</Card>
      ) : (
        <div className="space-y-3">
          {(reviews.data ?? []).map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-ink">
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)} · {r.productName}
                  </p>
                  <p className="text-xs text-muted">
                    by {r.authorName} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{" "}
                    {r.verifiedPurchase ? <Badge tone="green">Verified purchase</Badge> : null}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => moderate.mutate({ id: r.id, status: "approved" })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => moderate.mutate({ id: r.id, status: "hidden" })}
                  >
                    Hide
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setReplyFor(replyFor === r.id ? null : r.id)}
                  >
                    Reply
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-sm text-ink">
                {r.title ? <strong>{r.title}: </strong> : null}
                {r.body}
              </p>
              {r.replyBody ? (
                <p className="mt-2 rounded-xl bg-primary-50 p-3 text-xs text-primary-800">
                  <strong>Shop reply:</strong> {r.replyBody}
                </p>
              ) : null}
              {replyFor === r.id ? (
                <div className="mt-2 flex gap-2">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Reply as the shop…"
                    className="min-h-16"
                  />
                  <Button onClick={() => reply.mutate(r.id)} loading={reply.isPending}>
                    Post
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
      <Input className="hidden" aria-hidden tabIndex={-1} readOnly value="" />
    </div>
  );
}
