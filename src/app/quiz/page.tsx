import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { LearningPicker } from "@/components/quiz/learning-picker";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { getSessionUser } from "@/lib/db/server";
import { availableCategories } from "@/lib/quiz/availability";

export const dynamic = "force-dynamic";

export default async function QuizPickerPage() {
  const user = await getSessionUser();
  if (!user) redirect("/logowanie");

  const categories = await availableCategories();

  return (
    <AppShell active="quiz">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Tryb nauki</h1>
        <p className="mt-1 text-sm text-gray-500">
          20 pytań, feedback po każdym. Odznacz kategorie, których nie chcesz —
          domyślnie gramy wszystkim.
        </p>

        <div className="mt-5">
          <LearningPicker categories={categories} />
        </div>

        {categories.length === 0 && (
          <Card className="mt-5 border-dashed text-center text-sm text-gray-500">
            Baza pytań jest jeszcze pusta. Uruchom seed:{" "}
            <code className="rounded bg-gray-100 px-1">
              npx tsx scripts/import/seed-placeholder.ts
            </code>
          </Card>
        )}

        <div className="mt-8">
          <h2 className="text-xl font-bold">Wyzwanie</h2>
          <p className="mt-1 text-sm text-gray-500">
            Odpowiadasz, aż popełnisz błąd. Jeden. Bez litości.
          </p>
          <Link href="/quiz/gra?mode=challenge" className="mt-3 block">
            <Card className="border-dre-200 bg-dre-50/50 transition-all hover:border-dre-400 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-dre-700">⚡ Survival</h3>
                  <p className="mt-1 text-sm text-gray-600">
                    Ile odpowiesz z rzędu? Wynik trafia do tablicy rekordów.
                  </p>
                </div>
                <Chip tone="orange">1 błąd = koniec</Chip>
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
