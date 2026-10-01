"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import { Button, Card, Skeleton } from "@pgrs/ui";
import type { NotificationPreferences } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0">
      <div>
        <p className="text-sm font-bold text-ink">{label}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={
          checked
            ? "relative h-6 w-11 shrink-0 rounded-full bg-primary transition-colors"
            : "relative h-6 w-11 shrink-0 rounded-full bg-line transition-colors"
        }
      >
        <span
          className={
            checked
              ? "absolute left-[22px] top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
              : "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
          }
        />
      </button>
    </div>
  );
}

/** Per-channel notification preferences, persisted through the notifications API. */
export function NotificationPreferencesCard() {
  const queryClient = useQueryClient();
  const prefs = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => unwrap<NotificationPreferences>(api.api.notifications.preferences.$get({ query: {} })),
  });

  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  useEffect(() => {
    if (prefs.data && draft === null) setDraft(prefs.data);
  }, [prefs.data, draft]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      return unwrap<NotificationPreferences>(api.api.notifications.preferences.$put({ json: draft }));
    },
    onSuccess: () => {
      toast.success("Notification preferences saved");
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const dirty = draft != null && prefs.data != null && JSON.stringify(draft) !== JSON.stringify(prefs.data);

  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-2">
        {draft && !draft.orderUpdates && !draft.offers ? (
          <BellOff className="h-4 w-4 text-muted" aria-hidden />
        ) : (
          <Bell className="h-4 w-4 text-primary-700" aria-hidden />
        )}
        <h2 className="text-base font-bold text-ink">Notification preferences</h2>
      </div>
      <p className="mb-3 text-xs text-muted">
        Choose what we may message you about and through which channels. Order updates keep you informed about
        packing, delivery and refunds.
      </p>

      {prefs.isLoading || draft === null ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          <section aria-label="Topics">
            <ToggleRow
              label="Order updates"
              description="Placed, packed, out for delivery, delivered, refunds"
              checked={draft.orderUpdates}
              onChange={(orderUpdates) => setDraft({ ...draft, orderUpdates })}
            />
            <ToggleRow
              label="Offers and news"
              description="Seasonal deals and shop announcements"
              checked={draft.offers}
              onChange={(offers) => setDraft({ ...draft, offers })}
            />
          </section>
          <section aria-label="Channels" className="mt-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Channels</p>
            <ToggleRow
              label="SMS"
              description="Text messages to your registered mobile number"
              checked={draft.sms}
              onChange={(sms) => setDraft({ ...draft, sms })}
            />
            <ToggleRow
              label="WhatsApp"
              description="WhatsApp messages from the shop"
              checked={draft.whatsapp}
              onChange={(whatsapp) => setDraft({ ...draft, whatsapp })}
            />
            <ToggleRow
              label="Email"
              description="Receipts and updates by email"
              checked={draft.email}
              onChange={(email) => setDraft({ ...draft, email })}
            />
          </section>
          <Button className="mt-4" onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
            Save preferences
          </Button>
        </>
      )}
    </Card>
  );
}
