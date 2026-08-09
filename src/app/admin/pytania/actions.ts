"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/db/server";

const questionSchema = z.object({
  question: z.string().trim().min(5, "Treść pytania: min. 5 znaków").max(500),
  answers: z
    .array(z.string().trim().min(1, "Uzupełnij wszystkie 4 odpowiedzi").max(200))
    .length(4)
    .refine((a) => new Set(a).size === 4, "Odpowiedzi muszą być różne"),
  correctIndex: z.coerce.number().int().min(0).max(3),
  explanation: z.string().trim().max(600).optional(),
  category: z.string().trim().min(1).max(50),
  difficulty: z.coerce.number().int().min(1).max(3),
  active: z.boolean(),
});

export interface QuestionFormState {
  error?: string;
}

function parseForm(formData: FormData) {
  return questionSchema.safeParse({
    question: formData.get("question"),
    answers: [0, 1, 2, 3].map((i) => formData.get(`answer${i}`)),
    correctIndex: formData.get("correctIndex"),
    explanation: String(formData.get("explanation") ?? "").trim() || undefined,
    category: String(formData.get("category") ?? "").trim() || "teoria",
    difficulty: formData.get("difficulty"),
    active: formData.get("active") === "on",
  });
}

function db() {
  const client = createAdminClient();
  if (!client) throw new Error("Brak konfiguracji Supabase");
  return client;
}

export async function createQuestion(
  _prev: QuestionFormState,
  formData: FormData,
): Promise<QuestionFormState> {
  await assertAdmin();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane" };
  }
  const d = parsed.data;
  const { error } = await db().from("theory_questions").insert({
    question: d.question,
    answers: d.answers,
    correct_index: d.correctIndex,
    explanation: d.explanation ?? null,
    category: d.category,
    difficulty: d.difficulty,
    active: d.active,
    source: "admin",
  });
  if (error) return { error: `Nie udało się zapisać: ${error.message}` };
  revalidatePath("/admin/pytania");
  redirect("/admin/pytania");
}

export async function updateQuestion(
  _prev: QuestionFormState,
  formData: FormData,
): Promise<QuestionFormState> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Brak identyfikatora pytania" };
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane" };
  }
  const d = parsed.data;
  const { error } = await db()
    .from("theory_questions")
    .update({
      question: d.question,
      answers: d.answers,
      correct_index: d.correctIndex,
      explanation: d.explanation ?? null,
      category: d.category,
      difficulty: d.difficulty,
      active: d.active,
    })
    .eq("id", id);
  if (error) return { error: `Nie udało się zapisać: ${error.message}` };
  revalidatePath("/admin/pytania");
  redirect("/admin/pytania");
}

/** Miękkie wyłączenie z puli (pytanie zostaje, nie losuje się). */
export async function toggleQuestionActive(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true";
  if (!id) return;
  await db().from("theory_questions").update({ active: next }).eq("id", id);
  revalidatePath("/admin/pytania");
}

/**
 * Twarde usunięcie — bezpieczne dla historii: rozegrane sesje trzymają
 * kopię payloadu w session_questions, nie odwołanie do teorii.
 */
export async function deleteQuestion(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db().from("theory_questions").delete().eq("id", id);
  revalidatePath("/admin/pytania");
}
