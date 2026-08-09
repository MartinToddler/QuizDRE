import Link from "next/link";
import { Logo } from "@/components/logo";
import { requireAdminPage } from "@/lib/admin-guard";
import { AdminTabs } from "./tabs";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Logo className="text-xl" />
            </Link>
            <span className="rounded-full bg-dre-50 px-2.5 py-1 text-xs font-bold text-dre-700">
              🛡️ Panel admina
            </span>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-gray-500 hover:text-dre-600 hover:underline"
          >
            ← Wróć do aplikacji
          </Link>
        </div>
        <div className="mx-auto max-w-5xl px-4">
          <AdminTabs />
        </div>
        <div className="h-0.5 bg-gradient-to-r from-dre-500 via-dre-400 to-dre-500" />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
