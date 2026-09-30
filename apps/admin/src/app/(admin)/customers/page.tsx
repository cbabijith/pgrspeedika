"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, ShieldCheck } from "lucide-react";
import { Badge, Button, Input, Money } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";

interface CustomerRow {
  id: string;
  name: string;
  phoneNumber: string | null;
  email: string;
  banned: boolean;
  createdAt: string;
  orderCount: number;
  totalSpentPaise: number;
}

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const customers = useQuery({
    queryKey: ["admin-customers", q],
    queryFn: () => unwrap<CustomerRow[]>(api.api.admin.customers.$get({ query: { q } })),
  });

  const block = useMutation({
    mutationFn: async (input: { id: string; banned: boolean }) => {
      await unwrap(
        api.api.admin.customers[":id"].block.$post({
          param: { id: input.id },
          json: { banned: input.banned } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Customer updated");
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Customers</h1>
        <Input
          placeholder="Search name or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64"
          aria-label="Search customers"
        />
      </header>

      <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
        <table className="table-base">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Joined</th>
              <th>Orders</th>
              <th>Total spent</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(customers.data ?? []).map((c) => (
              <tr key={c.id}>
                <td className="font-semibold text-ink">{c.name || "—"}</td>
                <td className="font-mono text-xs">{c.phoneNumber ?? c.email}</td>
                <td className="text-muted">
                  {new Date(c.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className="tabular-nums">{c.orderCount}</td>
                <td>
                  <Money paise={c.totalSpentPaise} className="font-bold" />
                </td>
                <td>{c.banned ? <Badge tone="red">Blocked</Badge> : <Badge tone="green">Active</Badge>}</td>
                <td className="flex gap-1">
                  <Button
                    size="sm"
                    variant={c.banned ? "secondary" : "outline"}
                    onClick={() => block.mutate({ id: c.id, banned: !c.banned })}
                  >
                    {c.banned ? (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Unblock
                      </>
                    ) : (
                      <>
                        <Ban className="h-3.5 w-3.5" aria-hidden /> Block
                      </>
                    )}
                  </Button>
                  <Link href={`/orders?q=${encodeURIComponent(c.phoneNumber ?? "")}`}>
                    <Button size="sm" variant="ghost">
                      Orders
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
            {(customers.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted">
                  No customers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
