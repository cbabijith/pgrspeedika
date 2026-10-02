"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, unwrap } from "@/lib/api";
import { Money } from "@pgrs/ui";
import { useUIStore } from "@/store/ui";

interface Suggestion {
  slug: string;
  nameEn: string;
  nameMl: string;
  imageUrl: string | null;
  pricePaise: number;
  categorySlug: string;
}

export function SearchBox() {
  const router = useRouter();
  const searchId = useId();
  const lang = useUIStore((s) => s.lang);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["suggest", q],
    enabled: q.trim().length >= 2 && open,
    queryFn: () =>
      unwrap<{ suggestions: Suggestion[] }>(api.api.search.suggest.$get({ query: { q: q.trim() } })),
  });

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length === 0) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  const suggestions = data?.suggestions ?? [];

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={submit} role="search">
        <label htmlFor={searchId} className="sr-only">
          Search vegetables and groceries
        </label>
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface-muted px-4 py-2.5 focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <input
            id={searchId}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={lang === "en" ? "Search tomato, matta rice, തക്കാളി…" : "തക്കാളി, അരി തിരയുക…"}
            className="w-full bg-transparent text-base md:text-sm outline-none placeholder:text-muted"
            autoComplete="off"
          />
        </div>
      </form>

      {open && q.trim().length >= 2 ? (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-card border border-line bg-white shadow-lift">
          {suggestions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">No matches for “{q}”</p>
          ) : (
            <ul>
              {suggestions.map((s) => (
                <li key={s.slug}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(`/products/${s.slug}`);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-primary-50"
                  >
                    {s.imageUrl ? (
                      <img src={s.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                    ) : null}
                    <span className="flex-1 text-sm font-semibold text-ink">
                      {lang === "en" ? s.nameEn : s.nameMl}
                    </span>
                    <Money paise={s.pricePaise} className="text-xs font-bold text-primary-700" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
