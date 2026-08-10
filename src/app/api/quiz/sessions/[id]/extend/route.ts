import { NextResponse } from "next/server";
import { requireUser, withApi } from "@/lib/api";
import { extendChallengeBatch } from "@/lib/quiz/service";

/**
 * Dogrywka partii wyzwania — klient woła w tle, gdy kończą mu się
 * prefetchowane pytania (werdykt odpowiedzi nie czeka na generację).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const user = await requireUser();
    const { id } = await params;
    const questions = await extendChallengeBatch(user.id, id);
    return NextResponse.json({ questions });
  });
}
