"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { z } from "zod";
import { Alert, Button, Card, Field, Input } from "@pgrs/ui";
import { authClient } from "@/lib/auth";
import { useUIStore } from "@/store/ui";

const phoneFormSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
});
type PhoneForm = z.infer<typeof phoneFormSchema>;

const otpFormSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
type OtpForm = z.infer<typeof otpFormSchema>;

/** Phone OTP login (React Hook Form + Zod). New and returning customers. */
export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");

  const phoneForm = useForm<PhoneForm>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: { phone: "" },
  });

  const otpForm = useForm<OtpForm>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: { code: "" },
  });

  async function sendOtp(values: PhoneForm) {
    const normalized = `+91${values.phone}`;
    setPending(true);
    setError(null);
    const { error: err } = await authClient.phoneNumber.sendOtp({ phoneNumber: normalized });
    setPending(false);
    if (err) {
      setError(err.message ?? t("Could not send the code", "കോഡ് അയയ്ക്കാനായില്ല"));
      return;
    }
    setPhoneNumber(normalized);
    setStage("otp");
    toast.info(
      t(
        "OTP sent — in development it is printed in the shop console",
        "OTP അയച്ചു — ഡെവലപ്മെന്റിൽ കൺസോളിൽ കാണാം",
      ),
    );
  }

  async function verify(values: OtpForm) {
    setPending(true);
    setError(null);
    const { error: err } = await authClient.phoneNumber.verify({
      phoneNumber,
      code: values.code,
    });
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
        <form className="space-y-4" onSubmit={phoneForm.handleSubmit(sendOtp)} noValidate>
          <Field
            label={t("Mobile number", "മൊബൈൽ നമ്പർ")}
            htmlFor="phone"
            error={error ?? phoneForm.formState.errors.phone?.message}
          >
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-surface-muted px-3 py-2.5 text-sm font-bold text-muted">
                +91
              </span>
              <Input
                id="phone"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                aria-invalid={phoneForm.formState.isSubmitted && Boolean(phoneForm.formState.errors.phone)}
                {...phoneForm.register("phone")}
              />
            </div>
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={pending}>
            {t("Send code", "കോഡ് അയക്കുക")}
          </Button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={otpForm.handleSubmit(verify)} noValidate>
          <Alert tone="info">{t(`Code sent to ${phoneNumber}`, `${phoneNumber} ലേക്ക് കോഡ് അയച്ചു`)}</Alert>
          <Field
            label={t("6-digit code", "6 അക്ക കോഡ്")}
            htmlFor="otp"
            error={error ?? otpForm.formState.errors.code?.message}
          >
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              className="text-center text-xl tracking-[0.5em]"
              aria-invalid={otpForm.formState.isSubmitted && Boolean(otpForm.formState.errors.code)}
              {...otpForm.register("code")}
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
              otpForm.reset();
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
