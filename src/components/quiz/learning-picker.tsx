"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Category } from "@/lib/engine";
import { CATEGORY_INFO } from "./categories";

/**
 * Wybór kategorii trybu nauki: jedna, kilka lub wszystkie (domyślnie
 * wszystkie zaznaczone). Zaznaczenie wszystkich = dawny „mix”.
 */
export function LearningPicker({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<Category>>(new Set(categories));
  const [starting, setStarting] = useState(false);

  const toggle = (c: Category) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const start = () => {
    setStarting(true);
    const list = categories.filter((c) => selected.has(c));
    const param = list.length === categories.length ? "mix" : list.join(",");
    router.push(`/quiz/gra?mode=learning&categories=${param}`);
  };

  const allSelected = selected.size === categories.length;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {categories.map((cat) => {
          const info = CATEGORY_INFO[cat];
          const on = selected.has(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggle(cat)}
              aria-pressed={on}
              className={cn(
                "relative rounded-2xl border bg-white p-4 text-left transition-all",
                on
                  ? "border-dre-400 bg-dre-50/40 shadow-sm"
                  : "border-gray-200 opacity-70 hover:opacity-100",
              )}
            >
              <span
                className={cn(
                  "absolute right-3 top-3 flex size-6 items-center justify-center rounded-full border text-sm font-bold",
                  on
                    ? "border-dre-500 bg-dre-500 text-white"
                    : "border-gray-300 bg-white text-transparent",
                )}
                aria-hidden
              >
                ✓
              </span>
              <div className="text-2xl">{info.icon}</div>
              <h2 className="mt-2 pr-7 font-bold">{info.title}</h2>
              <p className="mt-1 text-sm text-gray-500">{info.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          onClick={start}
          disabled={selected.size === 0 || starting}
          size="lg"
          className="flex-1"
        >
          {starting
            ? "Startuję…"
            : selected.size === 0
              ? "Zaznacz choć jedną kategorię"
              : `Start — 20 pytań (${allSelected ? "wszystkie" : selected.size} z ${categories.length})`}
        </Button>
        {!allSelected && (
          <button
            type="button"
            onClick={() => setSelected(new Set(categories))}
            className="shrink-0 text-sm font-medium text-gray-500 hover:text-dre-600 hover:underline"
          >
            zaznacz wszystkie
          </button>
        )}
      </div>
    </div>
  );
}
