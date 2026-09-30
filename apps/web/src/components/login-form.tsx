"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { Alert, Button, Card, Field, Input } from "@pgrs/ui";
import { normalizePhone } from "@pgrs/contracts";
import { authClient } from "@/lib/auth";
import { useUIStore } from "@/store/ui";

/** Phone OTP login. Works for new and returning customers. */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = (() => {
    try {
      return normalizePhone(phone);
    } catch {
      return null;
    }
  })();

  async function sendOtp() {
    if (!normalized) {
      setError(t("Enter a valid 10-digit Indian mobile number", "സാധുവായ 10 അക്ക മൊബൈൽ നമ്പർ നൽകുക"));
      return;
    }
    setPending(true);
    setError(null);
    const { error: err } = await authClient.phoneNumber.sendOtp({ phoneNumber: normalized });
    setPending(false);
    if (err) {
      setError(err.message ?? t("Could not send the code", "കോഡ് അയയ്ക്കാനായില്ല"));
      return;
    }
    setStage("otp");
    toast.info(
      t(
        "OTP sent — in development it is printed in the shop console",
        "OTP അയച്ചു — ഡെവലപ്മെന്റിൽ കൺസോളിൽ കാണാം",
      ),
    );
  }

  async function verify() {
    if (!normalized) return;
    if (!/^\d{6}$/.test(code)) {
      setError(t("Enter the 6-digit code", "6 അക്ക കോഡ് നൽകുക"));
      return;
    }
    setPending(true);
    setError(null);
    const { error: err } = await authClient.phoneNumber.verify(
      { phoneNumber: normalized, code },
      { onSuccess: () => undefined },
    );
    setPending(false);
    if (err) {
      setError(err.message ?? t("Invalid code", "തെറ്റായ കോഡ്"));
      return;
    }
    toast.success(t("Welcome to PGRS Peedika!", "PGRS പീടികയിലേക്ക് സ്വാഗതം!"));
    router.push(next && next.startsWith("/") ? next : "/");
  }

  return (
    <Card className="w-full max-w-md p-8 shadow-lift">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-surface text-primary-700">
          <Smartphone className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-xl font-extrabold text-ink">
          {t("Login with your phone", "മൊബൈൽ നമ്പർ ഉപയോഗിച്ച് ലോഗിൻ")}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {t(
            "We send a 6-digit code — no passwords to remember.",
            "6 അക്ക കോഡ് അയയ്ക്കും — പാസ്‌വേഡ് വേണ്ട.",
          )}
        </p>
      </div>

      {stage === "phone" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void sendOtp();
          }}
        >
          <Field label={t("Mobile number", "മൊബൈൽ നമ്പർ")} htmlFor="phone" error={error ?? undefined}>
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-surface-muted px-3 py-2.5 text-sm font-bold text-muted">
                +91
              </span>
              <Input
                id="phone"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
            </div>
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={pending}>
            {t("Send code", "കോഡ് അയക്കുക")}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <Alert tone="info">{t(`Code sent to +91 ${phone}`, `+91 ${phone} ലേക്ക് കോഡ് അയച്ചു`)}</Alert>
          <Field label={t("6-digit code", "6 അക്ക കോഡ്")} htmlFor="otp" error={error ?? undefined}>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              className="text-center text-xl tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={pending}>
            {t("Verify & continue", "പരിശോധിച്ച് തുടരുക")}
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs font-semibold text-primary-700 underline"
            onClick={() => {
              setStage("phone");
              setCode("");
              setError(null);
            }}
          >
            {t("Change number / resend", "നമ്പർ മാറ്റുക / വീണ്ടും അയക്കുക")}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-muted">
        {t(
          "By continuing you agree to our Terms and Refund policy.",
          "തുടരുന്നതിലൂടെ നിബന്ധനകളും റീഫണ്ട് നയവും അംഗീകരിക്കുന്നു.",
        )}
      </p>
    </Card>
  );
}
