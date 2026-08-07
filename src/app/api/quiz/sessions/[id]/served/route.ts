import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, withApi } from "@/lib/api";
import { markServed, QuizError } from "@/lib/quiz/service";

const schema = z.object({ position: z.number().int().min(1) });

/**
 * Beacon „pytanie wyświetlone”. Pytania są prefetchowane z góry,
 * więc pomiar czasu odpowiedzi startuje dopiero tutaj.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = schema.safeParse(await request.json());
    if (!body.success) throw new QuizError("bad_request", 400);

    await markServed(user.id, id, body.data.position);
    return NextResponse.json({ ok: true });
  });
}
