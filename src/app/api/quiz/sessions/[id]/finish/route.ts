import { NextResponse } from "next/server";
import { requireUser, withApi } from "@/lib/api";
import { finishSession } from "@/lib/quiz/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json(await finishSession(user.id, id));
  });
}
