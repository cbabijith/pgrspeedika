"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";

interface AuditRow {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export default function AuditPage() {
  const audit = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => unwrap<AuditRow[]>(api.api.admin.audit.$get({ query: {} })),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Audit log</h1>
      <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
        <table className="table-base">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {(audit.data ?? []).map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap text-muted">
                  {new Date(row.createdAt).toLocaleString("en-IN", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </td>
                <td>
                  <Badge tone="outline">{row.actorRole ?? "system"}</Badge>
                </td>
                <td className="font-mono text-xs font-bold text-primary-700">{row.action}</td>
                <td className="text-xs text-muted">
                  {row.entityType}
                  {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ""}
                </td>
                <td className="max-w-md truncate text-xs text-muted">
                  {row.after ? JSON.stringify(row.after).slice(0, 120) : "—"}
                </td>
              </tr>
            ))}
            {(audit.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-muted">
                  No audit entries yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
