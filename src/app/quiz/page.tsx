import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { getSessionUser } from "@/lib/db/server";
import { availableCategories } from "@/lib/quiz/availability";
import type { Category } from "@/lib/engine";

export const dynamic = "force-dynamic";

const CATEGORY_INFO: Record<
  Category,
  { title: string; desc: string; icon: string }
> = {
  models: {
    title: "Modele",
    desc: "Zdjęcie drzwi — zgadnij, jaki to model.",
    icon: "🚪",
  },
  technical: {
    title: "Rozwiązania techniczne",
    desc: "Przylgi, wysokości, zawiasy — czy cecha występuje w modelu?",
    icon: "🔧",
  },
  dekory: {
    title: "Dekory",
    desc: "Czy model występuje w danym dekorze? TAK / NIE.",
    icon: "🎨",
  },
  left_right: {
    title: "Prawe / lewe",
    desc: "Spójrz na skrzydło i określ kierunek. Trening oka.",
    icon: "👁️",
  },
  theory: {
    title: "Teoria",
    desc: "Okleiny, budowa, normy — wiedza, która sprzedaje.",
    icon: "🎓",
  },
  mix: {
    title: "Mix",
    desc: "Wszystkie kategorie wymieszane. Pełny trening.",
    icon: "🎲",
  },
};

export default async function QuizPickerPage() {
  const user = await getSessionUser();
  if (!user) redirect("/logowanie");

  const categories = await availableCategories();

  return (
    <AppShell active="quiz">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Tryb nauki</h1>
        <p className="mt-1 text-sm text-gray-500">
          20 pytań, feedback po każdym. Wybierz kategorię:
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {categories.map((cat) => {
            const info = CATEGORY_INFO[cat];
            return (
              <Link key={cat} href={`/quiz/gra?mode=learning&category=${cat}`}>
                <Card className="h-full transition-all hover:border-dre-400 hover:shadow-md">
                  <div className="text-2xl">{info.icon}</div>
                  <h2 className="mt-2 font-bold">{info.title}</h2>
                  <p className="mt-1 text-sm text-gray-500">{info.desc}</p>
                </Card>
              </Link>
            );
          })}
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
