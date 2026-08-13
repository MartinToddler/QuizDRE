import { Card } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/admin-guard";
import { getDailyQuizSize, getQuestionMix } from "@/lib/db/settings";
import { DailySizeForm } from "./daily-size-form";
import { MixForm } from "./mix-form";

export const dynamic = "force-dynamic";

export default async function AdminMixPage() {
  await requireAdminPage();
  const [mix, dailySize] = await Promise.all([
    getQuestionMix(),
    getDailyQuizSize(),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Proporcje pytań</h1>
      <p className="mt-1 text-sm text-gray-500">
        Ustawienie <strong>globalne</strong> — dotyczy wszystkich użytkowników
        i wszystkich trybów (nauka „mix”, wyzwanie, Quiz Dnia). Wagi są
        względne; procenty wyliczają się same.
      </p>

      <Card className="mt-5">
        <MixForm initial={mix} />
      </Card>

      <h2 className="mt-8 text-xl font-bold">📅 Quiz Dnia</h2>
      <p className="mt-1 text-sm text-gray-500">
        Ile pytań ma dzienny zestaw (5–30). Wszyscy grają ten sam quiz, jedno
        podejście.
      </p>
      <Card className="mt-3">
        <DailySizeForm initial={dailySize} />
      </Card>

      <div className="mt-8 space-y-1.5 text-xs text-gray-400">
        <p>
          Waga 0 wyłącza kategorię z losowania. W trybie nauki użytkownik może
          nadal wybrać taką kategorię wprost — wtedy dostanie z niej pytania.
        </p>
        <p>
          Zmiany działają od następnej rozpoczętej sesji. Quiz Dnia jest
          generowany raz na dobę, więc nowe proporcje i długość obejmą go od
          jutra (dzisiejszy zestaw jest już rozdany).
        </p>
        <p>
          Pula pytań też ma znaczenie: gdy kategoria wyczerpie swoje pytania,
          brakujące pozycje przejmują pozostałe kategorie z wagą większą od
          zera. Wyłączone (waga 0) nigdy nie łatają braków — sesja będzie
          wtedy po prostu krótsza.
        </p>
      </div>
    </div>
  );
}
