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
  const [value, setValue] = useState("");
  const [state, setState] = useState<{ served: boolean; area?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Show the banner until the visitor has chosen a pincode.
    setDismissed(Boolean(pincode));
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
      <div className="container-page flex flex-col items-start gap-3 py-4 md:flex-row md:items-center">
        <div className="flex flex-1 items-start gap-2">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary-700" aria-hidden />
          <div>
            <p className="text-sm font-bold text-primary-800">
              {t("Where should we deliver?", "എവിടെ ഡെലിവർ ചെയ്യണം?")}
            </p>
            <p className="text-xs text-primary-700">
              {t("Check if we serve your pincode", "ഞങ്ങളുടെ സേവനം ലഭ്യമാണോ എന്ന് പരിശോധിക്കുക")}
              {zones.data
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
            placeholder="670001"
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
                "We don't deliver to this pincode yet — we're growing fast, check back soon!",
                "ഈ പിൻകോഡിലേക്ക് ഇതുവരെ ഡെലിവറിയില്ല — വളരെ പെട്ടെന്ന് എത്തും!",
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
