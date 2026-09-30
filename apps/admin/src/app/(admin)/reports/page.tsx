"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button, Card, Money, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@pgrs/ui";
import { API_URL, api, unwrap } from "@/lib/api";

type ReportKind =
  | "sales-by-day"
  | "sales-by-product"
  | "sales-by-category"
  | "gst-summary"
  | "payment-split"
  | "top-customers";

const REPORTS: Array<{ kind: ReportKind; label: string }> = [
  { kind: "sales-by-day", label: "Sales by day" },
  { kind: "sales-by-product", label: "Sales by product" },
  { kind: "sales-by-category", label: "Sales by category" },
  { kind: "gst-summary", label: "GST summary" },
  { kind: "payment-split", label: "Payment methods" },
  { kind: "top-customers", label: "Top customers" },
];

export default function ReportsPage() {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<ReportKind>("sales-by-day");

  const report = useQuery({
    queryKey: ["admin-report", kind, from, to],
    queryFn: () =>
      unwrap<{ rows: Array<Record<string, string | number>> }>(
        api.api.admin.reports[":kind"].$get({ param: { kind }, query: { from, to } }),
      ),
  });

  const rows = report.data?.rows ?? [];
  const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Reports</h1>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold text-muted">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-xl border border-line px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-muted">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-xl border border-line px-3 py-1.5 text-sm"
            />
          </label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as ReportKind)} className="w-48">
            {REPORTS.map((r) => (
              <option key={r.kind} value={r.kind}>
                {r.label}
              </option>
            ))}
          </Select>
          <a
            href={`${API_URL}/api/admin/reports/${kind}?from=${from}&to=${to}&format=csv`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline">
              <Download className="h-4 w-4" aria-hidden /> CSV
            </Button>
          </a>
        </div>
      </header>

      <Card className="overflow-x-auto p-0">
        <table className="table-base">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c.replace(/Paise$/, "").replace(/([A-Z])/g, " $1")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => {
                  const value = row[c];
                  return (
                    <td key={c} className={typeof value === "number" && c.includes("Paise") ? "" : ""}>
                      {typeof value === "number" && c.includes("Paise") ? (
                        <Money paise={value} className="font-bold" />
                      ) : (
                        String(value ?? "")
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(1, columns.length)} className="py-10 text-center text-muted">
                  {report.isLoading ? "Loading…" : "No data for this range."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
      <Tabs defaultValue="none">
        <TabsList className="hidden">
          <TabsTrigger value="none">none</TabsTrigger>
        </TabsList>
        <TabsContent value="none" />
      </Tabs>
    </div>
  );
}
