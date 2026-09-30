import type { ReactNode } from "react";
import { Card } from "@pgrs/ui";

/** Shared prose shell for support pages. */
export function StaticPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-primary-700">{title}</h1>
      {intro ? <p className="mt-2 text-sm text-muted">{intro}</p> : null}
      <Card className="mt-6 space-y-5 p-6 text-sm leading-relaxed text-ink [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_a]:font-semibold [&_a]:text-primary-700 [&_a]:underline">
        {children}
      </Card>
    </div>
  );
}
