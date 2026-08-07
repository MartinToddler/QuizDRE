import { redirect } from "next/navigation";
import { QuizGame } from "@/components/quiz/game";
import { CATEGORIES, MODES, type Category, type Mode } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default async function GamePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; category?: string }>;
}) {
  const params = await searchParams;
  const mode = params.mode as Mode | undefined;
  const category = params.category as Category | undefined;

  if (!mode || !MODES.includes(mode)) redirect("/quiz");
  if (category && !CATEGORIES.includes(category)) redirect("/quiz");

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <QuizGame mode={mode} category={category} />
    </main>
  );
}
