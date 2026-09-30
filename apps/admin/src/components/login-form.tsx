"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Store } from "lucide-react";
import { Button, Card, Field, Input } from "@pgrs/ui";
import { authClient } from "@/lib/auth";

/** Staff email + password login. */
export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (err) {
      setError(err.message ?? "Invalid email or password");
      return;
    }
    toast.success("Welcome back");
    router.replace("/dashboard");
  }

  return (
    <Card className="w-full max-w-sm p-8 shadow-lift">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-surface text-primary-700">
          <Store className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="text-xl font-extrabold text-ink">PGRS Peedika Admin</h1>
        <p className="mt-1 text-sm text-muted">Shop owner and staff sign-in</p>
      </div>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Email" htmlFor="email" error={error ?? undefined}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Sign in
        </Button>
      </form>
    </Card>
  );
}
