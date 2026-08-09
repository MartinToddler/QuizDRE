import { Card } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/admin-guard";
import { createQuestion } from "../actions";
import { QuestionForm } from "../question-form";

export const dynamic = "force-dynamic";

export default async function NewQuestionPage() {
  await requireAdminPage();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Nowe pytanie</h1>
      <Card className="mt-4">
        <QuestionForm
          action={createQuestion}
          submitLabel="Dodaj pytanie"
          defaults={{
            question: "",
            answers: ["", "", "", ""],
            correctIndex: 0,
            explanation: "",
            category: "teoria",
            difficulty: 2,
            active: true,
          }}
        />
      </Card>
    </div>
  );
}
