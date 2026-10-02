import { Badge } from "./badge";
import type { OrderStatus } from "@pgrs/contracts";

const STATUS_TONE: Record<OrderStatus, "neutral" | "green" | "amber" | "red"> = {
  awaiting_confirmation: "amber",
  pending_payment: "amber",
  confirmed: "green",
  packed: "green",
  out_for_delivery: "amber",
  delivered: "green",
  cancelled: "red",
};

export function StatusBadge({ status, lang = "en" }: { status: OrderStatus; lang?: "en" | "ml" }) {
  const label = {
    awaiting_confirmation: { en: "Awaiting confirmation", ml: "സ്ഥിരീകരണം കാത്തിരിക്കുന്നു" },
    pending_payment: { en: "Awaiting payment", ml: "പേയ്മെന്റ് കാത്തിരിപ്പ്" },
    confirmed: { en: "Placed", ml: "സ്വീകരിച്ചു" },
    packed: { en: "Packed", ml: "പായ്ക്ക് ചെയ്തു" },
    out_for_delivery: { en: "Out for delivery", ml: "ഡെലിവറിക്ക് പുറപ്പെട്ടു" },
    delivered: { en: "Delivered", ml: "എത്തിച്ചു" },
    cancelled: { en: "Cancelled", ml: "റദ്ദാക്കി" },
  }[status];
  return <Badge tone={STATUS_TONE[status]}>{label[lang]}</Badge>;
}
