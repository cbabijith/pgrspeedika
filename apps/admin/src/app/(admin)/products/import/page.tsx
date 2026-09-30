"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Alert, Button, Card } from "@pgrs/ui";
import { API_URL, unwrap } from "@/lib/api";
import { api } from "@/lib/api";

/** CSV import: uploads to /api/admin/catalog/import.csv and shows the result. */
export default function ImportPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [pending, setPending] = useState(false);

  async function upload(file: File) {
    setPending(true);
    setResult(null);
    try {
      const text = await file.text();
      const parsed = await unwrap<{ imported: number; errors: string[] }>(
        api.api.admin.catalog["import.csv"].$post(undefined, {
          // Send the raw CSV body with the right content type.
          init: {
            method: "POST",
            headers: { "content-type": "text/csv" },
            body: text,
          },
        }),
      );
      setResult(parsed);
      if (parsed.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Import catalog CSV</h1>
      <Alert tone="info">
        Required columns: slug, name_en, name_ml, category, hsn, gst_rate, selling_type, is_active,
        variant_sku, variant_label, unit_type, base_quantity, price_paise. Export first to see the exact
        format.
      </Alert>
      <Card className="space-y-3 p-5">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button onClick={() => fileRef.current?.click()} loading={pending}>
          <Upload className="h-4 w-4" aria-hidden /> Upload CSV
        </Button>
        <p className="text-xs text-muted">
          Tip: export from the Products page to get a template with the right columns.
        </p>
      </Card>
      {result ? (
        <Card className="space-y-2 p-5 text-sm">
          <p className="font-bold text-primary-700">{result.imported} row(s) imported.</p>
          {result.errors.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-danger">
              {result.errors.slice(0, 10).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
      <a href={`${API_URL}/api/admin/catalog/export.csv`} target="_blank" rel="noreferrer" className="hidden">
        export
      </a>
    </div>
  );
}
