import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/db/server";
import { QuizError } from "@/lib/quiz/service";

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new QuizError("unauthorized", 401);
  return user;
}

/** Wspólna obsługa błędów route handlerów. */
export async function withApi(
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (e) {
    if (e instanceof QuizError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    console.error("API error:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
