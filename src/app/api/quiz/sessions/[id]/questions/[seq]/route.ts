import { NextResponse } from "next/server";
import { requireUser, withApi } from "@/lib/api";
import { QuizError, serveQuestion } from "@/lib/quiz/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; seq: string }> },
) {
  return withApi(async () => {
    const user = await requireUser();
    const { id, seq } = await params;
    const seqNum = Number(seq);
    if (!Number.isInteger(seqNum) || seqNum < 1) {
      throw new QuizError("bad_request", 400);
    }
    return NextResponse.json(await serveQuestion(user.id, id, seqNum));
  });
}
