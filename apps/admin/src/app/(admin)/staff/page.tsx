"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Badge, Button, Card, Field, Input, Select } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "packer" | "delivery";
  banned: boolean;
}

export default function StaffPage() {
  const queryClient = useQueryClient();
  const staff = useQuery({
    queryKey: ["admin-staff"],
    queryFn: () => unwrap<StaffRow[]>(api.api.admin.staff.$get({ query: {} })),
  });

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "packer" as StaffRow["role"] });

  const invite = useMutation({
    mutationFn: async () => {
      await unwrap(api.api.admin.staff.$post({ json: form as never }));
    },
    onSuccess: () => {
      toast.success("Staff account created — share the password securely");
      setForm({ name: "", email: "", password: "", role: "packer" });
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; role?: string; banned?: boolean }) => {
      await unwrap(
        api.api.admin.staff[":id"].$patch({
          param: { id: input.id },
          json: input as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Staff updated");
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Staff & roles</h1>

      <Card className="grid gap-3 p-4 md:grid-cols-5 md:items-end">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Temporary password" hint="min 10 characters">
          <Input
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <Field label="Role">
          <Select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as StaffRow["role"] })}
          >
            <option value="manager">manager</option>
            <option value="packer">packer</option>
            <option value="delivery">delivery</option>
            <option value="owner">owner</option>
          </Select>
        </Field>
        <Button onClick={() => invite.mutate()} loading={invite.isPending}>
          <UserPlus className="h-4 w-4" aria-hidden /> Add staff
        </Button>
      </Card>

      <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
        <table className="table-base">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(staff.data ?? []).map((s) => (
              <tr key={s.id}>
                <td className="font-semibold text-ink">{s.name}</td>
                <td className="font-mono text-xs">{s.email}</td>
                <td>
                  <Select
                    value={s.role}
                    onChange={(e) => update.mutate({ id: s.id, role: e.target.value })}
                    className="w-36 py-1 text-xs"
                    aria-label={`Role for ${s.name}`}
                  >
                    <option value="owner">owner</option>
                    <option value="manager">manager</option>
                    <option value="packer">packer</option>
                    <option value="delivery">delivery</option>
                  </Select>
                </td>
                <td>{s.banned ? <Badge tone="red">Blocked</Badge> : <Badge tone="green">Active</Badge>}</td>
                <td>
                  <Button
                    size="sm"
                    variant={s.banned ? "secondary" : "outline"}
                    onClick={() => update.mutate({ id: s.id, banned: !s.banned })}
                  >
                    {s.banned ? "Unblock" : "Block"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
