import { redirect } from "next/navigation";
import { QuizGame } from "@/components/quiz/game";
import { CATEGORIES, MODES, type Category, type Mode } from "@/lib/engine";

export const dynamic = "force-dynamic";

function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export default async function GamePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; category?: string; categories?: string }>;
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

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <QuizGame mode={mode} categories={categories} />
    </main>
  );
}
