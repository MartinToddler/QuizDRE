import Link from "next/link";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/cn";

type NavKey = "home" | "quiz" | "ranking" | "profil";

const NAV: { key: NavKey; href: string; label: string; icon: string }[] = [
  { key: "home", href: "/", label: "Start", icon: "🏠" },
  { key: "quiz", href: "/quiz", label: "Graj", icon: "▶️" },
  { key: "ranking", href: "/ranking", label: "Rankingi", icon: "🏆" },
  { key: "profil", href: "/profil", label: "Profil", icon: "👤" },
];

/** Layout aplikacji: górny pasek + dolna nawigacja mobilna. */
export function AppShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active: NavKey;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/">
            <Logo className="text-xl" />
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  active === item.key
                    ? "bg-dre-50 text-dre-700"
                    : "text-gray-600 hover:bg-gray-100",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/ustawienia"
            aria-label="Ustawienia"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            ⚙️
          </Link>
        </div>
        <div className="h-0.5 bg-gradient-to-r from-dre-500 via-dre-400 to-dre-500" />
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 pb-24 sm:pb-8">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white sm:hidden">
        <div className="grid grid-cols-4">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium",
                active === item.key ? "text-dre-600" : "text-gray-500",
              )}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
