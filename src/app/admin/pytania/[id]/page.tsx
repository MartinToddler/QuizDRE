import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/db/server";
import { updateQuestion } from "../actions";
import { QuestionForm } from "../question-form";

export const dynamic = "force-dynamic";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;

  const db = createAdminClient()!;
  const { data: q } = await db
    .from("theory_questions")
    .select("id, question, answers, correct_index, explanation, category, difficulty, active")
    .eq("id", id)
    .maybeSingle();
  if (!q) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Edycja pytania</h1>
      <Card className="mt-4">
        <QuestionForm
          action={updateQuestion}
          submitLabel="Zapisz zmiany"
          defaults={{
            id: q.id,
            question: q.question,
            answers: (q.answers as string[]).concat(["", "", "", ""]).slice(0, 4),
            correctIndex: q.correct_index,
            explanation: q.explanation ?? "",
            category: q.category,
            difficulty: q.difficulty,
            active: q.active,
          }}
        />
      </Card>
    </div>
  );
}
