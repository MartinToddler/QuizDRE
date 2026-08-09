"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin/pytania", label: "Pytania" },
  { href: "/admin/uzytkownicy", label: "Użytkownicy" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 pb-2">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              active ? "bg-dre-50 text-dre-700" : "text-gray-600 hover:bg-gray-100",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
