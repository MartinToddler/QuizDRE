import { NextResponse } from "next/server";
import { requireUser, withApi } from "@/lib/api";
import { startSessionSchema } from "@/lib/engine";
import { QuizError, startSession } from "@/lib/quiz/service";

export async function POST(request: Request) {
  return withApi(async () => {
    const user = await requireUser();
    const body = startSessionSchema.safeParse(await request.json());
    if (!body.success) throw new QuizError("bad_request", 400);

    const result = await startSession(
      user.id,
      body.data.mode,
      body.data.categories ??
        (body.data.category ? [body.data.category] : undefined),
      body.data.resume,
    );
    return NextResponse.json(result, { status: 201 });
  });
}
