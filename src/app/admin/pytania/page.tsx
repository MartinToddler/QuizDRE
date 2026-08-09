import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { requireAdminPage } from "@/lib/admin-guard";
import { fetchAll } from "@/lib/db/catalog";
import { createAdminClient } from "@/lib/db/server";
import { cn } from "@/lib/cn";
import { RowActions } from "./row-actions";

export const dynamic = "force-dynamic";

interface QuestionRow {
  id: string;
  question: string;
  answers: string[];
  correct_index: number;
  category: string;
  difficulty: number;
  active: boolean;
  source: string | null;
}

const DIFFICULTY = ["", "łatwe", "średnie", "trudne"];

export default async function AdminQuestionsPage() {
  await requireAdminPage();
  const db = createAdminClient()!;

  const questions = await fetchAll<QuestionRow>((from, to) =>
    db
      .from("theory_questions")
      .select("id, question, answers, correct_index, category, difficulty, active, source")
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  const activeCount = questions.filter((q) => q.active).length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pytania teoretyczne</h1>
          <p className="mt-1 text-sm text-gray-500">
            {questions.length} pytań, {activeCount} aktywnych w puli. Zmiany
            działają od następnej sesji.
          </p>
        </div>
        <Link href="/admin/pytania/nowe">
          <Button>➕ Nowe pytanie</Button>
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {questions.map((q) => (
          <Card key={q.id} className={cn("p-4", !q.active && "opacity-60")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold leading-snug">{q.question}</p>
                <ul className="mt-2 space-y-0.5 text-sm">
                  {q.answers.map((a, i) => (
                    <li
                      key={i}
                      className={
                        i === q.correct_index
                          ? "font-semibold text-green-700"
                          : "text-gray-500"
                      }
                    >
                      {i === q.correct_index ? "✓ " : "· "}
                      {a}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip tone="gray">{q.category}</Chip>
                  <Chip tone="gray">{DIFFICULTY[q.difficulty] ?? q.difficulty}</Chip>
                  {q.source === "admin" && <Chip tone="orange">ręczne</Chip>}
                  {!q.active && <Chip tone="gray">wyłączone</Chip>}
                </div>
              </div>
              <RowActions id={q.id} active={q.active} />
            </div>
          </Card>
        ))}

        {questions.length === 0 && (
          <Card className="border-dashed text-center text-sm text-gray-500">
            Brak pytań — dodaj pierwsze przyciskiem powyżej.
          </Card>
        )}
      </div>
    </div>
  );
}
