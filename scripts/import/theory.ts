/**
 * Import pytań teoretycznych z materialy/teoria/*.json.
 *
 *   npx tsx scripts/import/theory.ts [--dry-run] [--file <ścieżka>]
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { adminClient } from "../lib/db";

const questionSchema = z.object({
  id: z.string().min(1),
  category: z.string().default("teoria"),
  question: z.string().min(8),
  answers: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().optional(),
  difficulty: z.number().int().min(1).max(3).default(2),
});
const fileSchema = z.object({ questions: z.array(questionSchema).min(1) });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");

async function main() {
  const files = args.includes("--file")
    ? [args[args.indexOf("--file") + 1]]
    : readdirSync("materialy/teoria")
        .filter((f) => f.endsWith(".json"))
        .map((f) => join("materialy/teoria", f));

  if (files.length === 0) {
    console.log("Brak plików JSON w materialy/teoria — nic do zrobienia.");
    return;
  }

  const all: z.infer<typeof questionSchema>[] = [];
  for (const file of files) {
    const parsed = fileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success) {
      console.error(`✗ ${file}: ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`);
      process.exit(1);
    }
    all.push(...parsed.data.questions);
    console.log(`  ${file}: ${parsed.data.questions.length} pytań`);
  }

  const ids = new Set<string>();
  for (const q of all) {
    if (ids.has(q.id)) {
      console.error(`✗ Zduplikowane id pytania: ${q.id}`);
      process.exit(1);
    }
    ids.add(q.id);
    if (new Set(q.answers.map((a) => a.trim().toLowerCase())).size !== 4) {
      console.error(`✗ Pytanie ${q.id}: odpowiedzi muszą być unikatowe`);
      process.exit(1);
    }
  }

  if (DRY) {
    console.log(`\n--dry-run: ${all.length} pytań poprawnych, bez zapisu.`);
    return;
  }

  const db = adminClient();
  const { error } = await db.from("theory_questions").upsert(
    all.map((q) => ({
      external_id: q.id,
      category: q.category,
      question: q.question,
      answers: q.answers,
      correct_index: q.correctIndex,
      explanation: q.explanation ?? null,
      difficulty: q.difficulty,
      active: true,
    })),
    { onConflict: "external_id" },
  );
  if (error) throw error;
  console.log(`\n✓ Zapisano ${all.length} pytań teoretycznych.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
