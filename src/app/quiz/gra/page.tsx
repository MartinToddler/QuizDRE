import { redirect } from "next/navigation";
import { QuizGame } from "@/components/quiz/game";
import { CATEGORIES, MODES, type Category, type Mode } from "@/lib/engine";

export const dynamic = "force-dynamic";

function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GamePage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    category?: string;
    categories?: string;
    sesja?: string;
    /** Id poprzedniej sesji z linku „Jeszcze raz” — tylko różnicuje key. */
    po?: string;
  }>;
}) {
  const params = await searchParams;
  const mode = params.mode as Mode | undefined;

  if (!mode || !MODES.includes(mode)) redirect("/quiz");

  // Nowy format: ?categories=a,b,c (multi-wybór); stary ?category= dalej działa.
  let categories: Category[] | undefined;
  if (params.categories) {
    const list = params.categories.split(",").map((s) => s.trim()).filter(Boolean);
    categories = list.filter(isCategory);
    if (categories.length === 0) redirect("/quiz");
  } else if (params.category) {
    if (!isCategory(params.category)) redirect("/quiz");
    categories = [params.category];
  }

  // ?sesja=<id> wpisuje klient po starcie — odświeżenie wznawia TĘ sesję.
  const resumeSessionId =
    params.sesja && UUID_RE.test(params.sesja) ? params.sesja : undefined;

  return (
    // Gra mieści się w wysokości okna (dvh — pasek adresu nie ucina dołu):
    // nic się nie przewija, elastyczny jest tylko obrazek pytania.
    // pb: zapas na dolny pasek systemowy w trybie PWA (iOS home indicator).
    <main className="h-dvh overflow-hidden bg-gray-50 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      {/* key: zmiana parametrów (np. „Jeszcze raz” bez `sesja`) = świeży montaż gry */}
      <QuizGame
        key={`${mode}|${categories?.join(",") ?? ""}|${resumeSessionId ?? ""}|${params.po ?? ""}`}
        mode={mode}
        categories={categories}
        resumeSessionId={resumeSessionId}
      />
    </main>
  );
}
