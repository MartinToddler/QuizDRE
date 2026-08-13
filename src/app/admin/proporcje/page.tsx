import { Card } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/admin-guard";
import { getQuestionMix } from "@/lib/db/settings";
import { MixForm } from "./mix-form";

export const dynamic = "force-dynamic";

export default async function AdminMixPage() {
  await requireAdminPage();
  const mix = await getQuestionMix();

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

      <div className="mt-4 space-y-1.5 text-xs text-gray-400">
        <p>
          Waga 0 wyłącza kategorię z losowania. W trybie nauki użytkownik może
          nadal wybrać taką kategorię wprost — wtedy dostanie z niej pytania.
        </p>
        <p>
          Zmiany działają od następnej rozpoczętej sesji. Quiz Dnia jest
          generowany raz na dobę, więc nowe proporcje obejmą go od jutra.
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
