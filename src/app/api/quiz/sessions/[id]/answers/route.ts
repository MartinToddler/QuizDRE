import { NextResponse } from "next/server";
import { requireUser, withApi } from "@/lib/api";
import { submitAnswerSchema } from "@/lib/engine";
import { QuizError, submitAnswer } from "@/lib/quiz/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = submitAnswerSchema.safeParse(await request.json());
    if (!body.success) throw new QuizError("bad_request", 400);

    const result = await submitAnswer(
      user.id,
      id,
      body.data.position,
      body.data.answer,
    );
    return NextResponse.json(result);
  });
}
