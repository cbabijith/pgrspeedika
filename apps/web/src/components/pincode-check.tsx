"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, X } from "lucide-react";
import { Alert, Button, Input } from "@pgrs/ui";
import type { ZoneDTO } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";
import { useUIStore } from "@/store/ui";

/** First-visit pincode gate: saves the served area and blocks nothing else. */
export function PincodeCheck() {
  const pincode = useUIStore((s) => s.pincode);
  const setPincode = useUIStore((s) => s.setPincode);
  const lang = useUIStore((s) => s.lang);
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState("");
  const [state, setState] = useState<{ served: boolean; area?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  // Render the banner on the server AND first paint (fresh visitors), so it
  // never shifts the page after hydration. Returning visitors with a saved
  // pincode collapse it right after mount — one small shift for them only.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (pincode) setDismissed(true);
  }, [pincode]);

  const zones = useQuery({
    queryKey: ["zones"],
    queryFn: () => unwrap<ZoneDTO[]>(api.api.delivery.zones.$get()),
  });

  const t = (en: string, ml: string) => (lang === "en" ? en : ml);

  async function check() {
    if (!/^[1-9]\d{5}$/.test(value)) {
      setState({ served: false });
      return;
    }
    setChecking(true);
    try {
      const result = await unwrap<{ served: boolean; zone: ZoneDTO | null }>(
        api.api.delivery["check-pincode"].$post({ json: { pincode: value } }),
      );
      setState({ served: result.served, area: result.zone?.areaNameEn });
      if (result.served && result.zone) {
        setPincode(value, result.zone.areaNameEn);
      } else {
        setPincode(null, null);
      }
    } finally {
      setChecking(false);
    }
  }

  if (dismissed) return null;

  return (
    <div className="border-b border-primary-200 bg-primary-50">
      <div className="container-page flex min-h-12 items-center justify-between gap-2 md:hidden">
        <span className="flex items-center gap-1.5 text-xs font-bold text-primary-800">
          <MapPin className="h-4 w-4" aria-hidden />
          Kottayam delivery
        </span>
        <button
          type="button"
          className="min-h-11 px-2 text-xs font-bold text-primary-700"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {t("Check pincode", "പിൻകോഡ് പരിശോധിക്കുക")}
        </button>
      </div>
      <div
        className={`container-page ${expanded ? "flex" : "hidden"} flex-col items-start gap-3 py-3 md:flex md:flex-row md:items-center`}
      >
        <div className="flex flex-1 items-start gap-2">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" aria-hidden />
          <div>
            <p className="text-sm font-bold text-primary-800">
              {t("Where should we deliver?", "എവിടെ ഡെലിവർ ചെയ്യണം?")}
            </p>
            <p className="text-xs text-primary-700">
              {t(
                "Kottayam district only · Check your pincode",
                "കോട്ടയം ജില്ലയിൽ മാത്രം · പിൻകോഡ് പരിശോധിക്കുക",
              )}
              {zones.data?.length
                ? ` · ${zones.data
                    .map((z) => z.pincode)
                    .slice(0, 4)
                    .join(", ")}…`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex w-full max-w-sm items-center gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="686001"
            inputMode="numeric"
            aria-label="Delivery pincode"
          />
          <Button onClick={check} loading={checking}>
            {t("Check", "പരിശോധിക്കുക")}
          </Button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="rounded-full p-2 text-primary-700 hover:bg-primary-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {state && !state.served ? (
          <div className="w-full">
            <Alert tone="warning">
              {t(
                "Delivery is currently limited to enabled pincodes in Kottayam district.",
                "നിലവിൽ കോട്ടയം ജില്ലയിലെ തിരഞ്ഞെടുത്ത പിൻകോഡുകളിൽ മാത്രമാണ് ഡെലിവറി.",
              )}
            </Alert>
          </div>
        ) : null}
        {state?.served ? (
          <p className="text-sm font-bold text-primary-700">
            ✓ {state.area} — {t("we deliver here!", "ഇവിടെ ഡെലിവറി ഉണ്ട്!")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
