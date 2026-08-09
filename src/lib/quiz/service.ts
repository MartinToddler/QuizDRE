import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAll,
  loadCatalogSnapshot,
  signImagePath,
  signImagePaths,
} from "@/lib/db/catalog";
import { createAdminClient } from "@/lib/db/server";
import {
  challengeOverComment,
  composeChallengeBatch,
  composeDailyQuiz,
  composeLearningSession,
  newGenState,
  perfectComment,
  pickComment,
  randomRng,
  seedFromString,
  mulberry32,
  type AnswerValue,
  type Category,
  type GeneratedQuestion,
  type Mode,
  type QuestionPayload,
} from "@/lib/engine";

/** Data w strefie Europe/Warsaw jako YYYY-MM-DD (spójna z SQL). */
export function warsawToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export class QuizError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

function admin(): SupabaseClient {
  const db = createAdminClient();
  if (!db) throw new QuizError("not_configured", 503);
  return db;
}

/** Mapowanie wyjątków z funkcji SQL na statusy HTTP. */
function mapDbError(message: string): QuizError {
  const known: Record<string, number> = {
    session_not_found: 404,
    session_not_active: 409,
    question_not_found: 404,
    already_answered: 409,
    too_fast: 429,
    no_questions: 503,
  };
  for (const [code, status] of Object.entries(known)) {
    if (message.includes(code)) return new QuizError(code, status);
  }
  // Kategoria „dekory” wymaga migracji 0007 (check constraint w bazie).
  if (message.includes("quiz_sessions_category_check")) {
    return new QuizError("migration_required", 503);
  }
  return new QuizError(`db_error: ${message}`, 500);
}

export interface ServedQuestion {
  seq: number;
  total: number;
  qtype: string;
  payload: QuestionPayload;
  imageUrl: string | null;
  swatchUrl: string | null;
  mode: Mode;
  correctCount: number;
}

/**
 * Lekki DTO pytania do prefetchu — payload nigdy nie zawiera odpowiedzi,
 * więc klient może dostać CAŁĄ listę z góry i przechodzić między pytaniami
 * bez czekania na serwer. served_at ustawia beacon przy wyświetleniu.
 */
export interface QuestionDto {
  seq: number;
  qtype: string;
  payload: QuestionPayload;
  imageUrl: string | null;
  /** Próbka dekoru (pytania o dekory) — mały obrazek obok zdjęcia modelu. */
  swatchUrl: string | null;
}

export interface SessionStart {
  sessionId: string;
  mode: Mode;
  /** Pełna liczba pytań sesji (przy wznowieniu większa niż questions.length). */
  total: number;
  /** Dotychczas odpowiedziane / poprawne / zdobyte XP (0 przy świeżej sesji). */
  answered: number;
  correct: number;
  xpEarned: number;
  /** true = wznowiona aktywna sesja (np. po odświeżeniu strony). */
  resumed: boolean;
  questions: QuestionDto[];
}

interface SessionRow {
  id: string;
  user_id: string;
  mode: Mode;
  status: string;
  question_count: number;
  correct_count: number;
  wrong_count: number;
}

async function getOwnedSession(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<SessionRow> {
  const { data, error } = await db
    .from("quiz_sessions")
    .select("id, user_id, mode, status, question_count, correct_count, wrong_count")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw mapDbError(error.message);
  if (!data) throw new QuizError("session_not_found", 404);
  return data as SessionRow;
}

function toDbRows(questions: GeneratedQuestion[], startSeq: number) {
  return questions.map((q, i) => ({
    seq: startSeq + i,
    qtype: q.qtype,
    dedupeKey: q.dedupeKey,
    payload: q.payload,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
    imagePath: q.imagePath,
    // starsze wpisy daily_quiz nie mają pola — jawny null zamiast undefined
    swatchPath: q.swatchPath ?? null,
  }));
}

/** Id pytań teoretycznych z ostatnich 3 sesji — unikamy powtórek. */
async function recentTheoryIds(
  db: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data: sessions } = await db
    .from("quiz_sessions")
    .select("id")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(3);
  if (!sessions?.length) return new Set();
  const { data: rows } = await db
    .from("session_questions")
    .select("dedupe_key")
    .in(
      "session_id",
      sessions.map((s) => s.id),
    )
    .like("dedupe_key", "t:%");
  return new Set((rows ?? []).map((r) => r.dedupe_key.slice(2)));
}

interface QuestionRow {
  seq: number;
  qtype: string;
  payload: unknown;
  image_path: string | null;
  swatch_path: string | null;
  answered_at: string | null;
}

/**
 * Select pytań sesji odporny na brak kolumny swatch_path
 * (okno między deployem a wklejeniem migracji 0007).
 */
async function selectQuestionRows(
  db: SupabaseClient,
  sessionId: string,
  opts: { seq?: number; fromSeq?: number },
): Promise<QuestionRow[]> {
  const run = (cols: string) => {
    let q = db
      .from("session_questions")
      .select(cols)
      .eq("session_id", sessionId);
    if (opts.seq !== undefined) q = q.eq("seq", opts.seq);
    if (opts.fromSeq !== undefined) {
      q = q.gte("seq", opts.fromSeq).is("answered_at", null);
    }
    return q.order("seq");
  };

  const base = "seq, qtype, payload, image_path, answered_at";
  const full = await run(`${base}, swatch_path`);
  if (!full.error) return (full.data ?? []) as unknown as QuestionRow[];
  if (full.error.code !== "42703") throw mapDbError(full.error.message);

  const legacy = await run(base);
  if (legacy.error) throw mapDbError(legacy.error.message);
  return ((legacy.data ?? []) as unknown as Omit<QuestionRow, "swatch_path">[]).map(
    (r) => ({ ...r, swatch_path: null }),
  );
}

async function serve(
  db: SupabaseClient,
  userId: string,
  session: SessionRow,
  seq: number,
): Promise<ServedQuestion> {
  const [q] = await selectQuestionRows(db, session.id, { seq });
  if (!q) throw new QuizError("question_not_found", 404);
  if (q.answered_at) throw new QuizError("already_answered", 409);

  const { error: e2 } = await db.rpc("mark_question_served", {
    p_user_id: userId,
    p_session_id: session.id,
    p_seq: seq,
  });
  if (e2) throw mapDbError(e2.message);

  return {
    seq: q.seq,
    total: session.question_count,
    qtype: q.qtype,
    payload: q.payload as QuestionPayload,
    imageUrl: await signImagePath(db, q.image_path),
    swatchUrl: await signImagePath(db, q.swatch_path),
    mode: session.mode,
    correctCount: session.correct_count,
  };
}

/** Wszystkie nieodpowiedziane pytania od fromSeq — payloady + zbiorczo podpisane URL-e. */
async function serveBatch(
  db: SupabaseClient,
  sessionId: string,
  fromSeq: number,
): Promise<QuestionDto[]> {
  const rows = await selectQuestionRows(db, sessionId, { fromSeq });
  const signed = await signImagePaths(
    db,
    rows
      .flatMap((r) => [r.image_path, r.swatch_path])
      .filter((p): p is string => Boolean(p)),
  );
  return rows.map((r) => ({
    seq: r.seq,
    qtype: r.qtype,
    payload: r.payload as QuestionPayload,
    imageUrl: r.image_path ? (signed.get(r.image_path) ?? null) : null,
    swatchUrl: r.swatch_path ? (signed.get(r.swatch_path) ?? null) : null,
  }));
}

/** Beacon „pytanie wyświetlone” — startuje serwerowy pomiar czasu odpowiedzi. */
export async function markServed(
  userId: string,
  sessionId: string,
  seq: number,
): Promise<void> {
  const db = admin();
  const { error } = await db.rpc("mark_question_served", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_seq: seq,
  });
  if (error) throw mapDbError(error.message);
}

/* ------------------------------------------------------------------ */
/* Start sesji                                                         */
/* ------------------------------------------------------------------ */

export async function startSession(
  userId: string,
  mode: Mode,
  categories?: Category[],
  resumeId?: string,
): Promise<SessionStart> {
  const db = admin();

  if (mode === "daily") return startDailySession(db, userId);

  // Wznowienie TYLKO na jawne żądanie (parametr `sesja` w URL, czyli
  // odświeżenie/powrót na kartę gry). Świadomy start z pickera nie niesie
  // resumeId — wtedy zawsze nowa sesja, a starą porzuca create_session.
  if (resumeId) {
    const { data: active } = await db
      .from("quiz_sessions")
      .select("id, mode, question_count, correct_count, wrong_count, xp_earned")
      .eq("id", resumeId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (active && active.mode === mode) {
      const resumed = await resumeSession(db, userId, active);
      if (resumed) return resumed;
    }
  }

  const [snapshot, recent] = await Promise.all([
    loadCatalogSnapshot(db),
    recentTheoryIds(db, userId),
  ]);
  const state = newGenState({ recentTheoryIds: recent });
  const rng = randomRng();

  const picked = categories?.length ? categories : (["mix"] as Category[]);
  const questions =
    mode === "learning"
      ? composeLearningSession(snapshot, picked, state, rng)
      : composeChallengeBatch(snapshot, state, rng);

  if (questions.length === 0) throw new QuizError("no_questions", 503);

  const { data: sessionId, error } = await db.rpc("create_session", {
    p_user_id: userId,
    p_mode: mode,
    p_category:
      mode === "learning"
        ? picked.length === 1
          ? picked[0]
          : "mix"
        : null,
    p_daily_quiz_id: null,
    p_questions: toDbRows(questions, 1),
  });
  if (error) throw mapDbError(error.message);

  return finalizeStart(db, userId, sessionId as string, mode);
}

/** Wspólne zakończenie startu: pełna lista pytań + pierwsze oznaczone jako wyświetlone. */
async function finalizeStart(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
  mode: Mode,
): Promise<SessionStart> {
  const [served] = await Promise.all([
    serveBatch(db, sessionId, 1),
    db.rpc("mark_question_served", {
      p_user_id: userId,
      p_session_id: sessionId,
      p_seq: 1,
    }),
  ]);
  return {
    sessionId,
    mode,
    total: served.length,
    answered: 0,
    correct: 0,
    xpEarned: 0,
    resumed: false,
    questions: served,
  };
}

interface ActiveSessionRow {
  id: string;
  mode: Mode;
  question_count: number;
  correct_count: number;
  wrong_count: number;
  xp_earned: number;
}

/**
 * Wznowienie aktywnej sesji: nieodpowiedziane pytania + liczniki postępu.
 * null, gdy nie ma czego wznawiać (wszystko odpowiedziane) — wtedy
 * create_session domknie starą sesję jak dotąd.
 */
async function resumeSession(
  db: SupabaseClient,
  userId: string,
  session: ActiveSessionRow,
): Promise<SessionStart | null> {
  const questions = await serveBatch(db, session.id, 1);
  if (questions.length === 0) return null;

  await db.rpc("mark_question_served", {
    p_user_id: userId,
    p_session_id: session.id,
    p_seq: questions[0].seq,
  });

  return {
    sessionId: session.id,
    mode: session.mode,
    total: session.question_count,
    answered: session.correct_count + session.wrong_count,
    correct: session.correct_count,
    xpEarned: session.xp_earned,
    resumed: true,
    questions,
  };
}

async function startDailySession(
  db: SupabaseClient,
  userId: string,
): Promise<SessionStart> {
  const today = warsawToday();

  let { data: daily } = await db
    .from("daily_quiz")
    .select("id, questions")
    .eq("quiz_date", today)
    .maybeSingle();

  if (!daily) {
    // Leniwa, deterministyczna generacja; unikat quiz_date czyni ją race-safe.
    const snapshot = await loadCatalogSnapshot(db);
    const rng = mulberry32(seedFromString(`quizdre-daily-${today}`));
    const questions = composeDailyQuiz(snapshot, newGenState(), rng);
    if (questions.length === 0) throw new QuizError("no_questions", 503);
    await db
      .from("daily_quiz")
      .upsert(
        { quiz_date: today, questions },
        { onConflict: "quiz_date", ignoreDuplicates: true },
      );
    const re = await db
      .from("daily_quiz")
      .select("id, questions")
      .eq("quiz_date", today)
      .maybeSingle();
    daily = re.data;
  }
  if (!daily) throw new QuizError("no_questions", 503);

  const { data: existing } = await db
    .from("quiz_sessions")
    .select("id, mode, status, question_count, correct_count, wrong_count, xp_earned")
    .eq("user_id", userId)
    .eq("daily_quiz_id", daily.id)
    .maybeSingle();
  if (existing) {
    // Odświeżenie w trakcie Quizu Dnia nie może blokować podejścia.
    if (existing.status === "active") {
      const resumed = await resumeSession(db, userId, existing);
      if (resumed) return resumed;
    }
    throw new QuizError("daily_already_played", 409);
  }

  const questions = daily.questions as GeneratedQuestion[];
  const { data: sessionId, error } = await db.rpc("create_session", {
    p_user_id: userId,
    p_mode: "daily",
    p_category: null,
    p_daily_quiz_id: daily.id,
    p_questions: toDbRows(questions, 1),
  });
  if (error) throw mapDbError(error.message);

  return finalizeStart(db, userId, sessionId as string, "daily");
}

/* ------------------------------------------------------------------ */
/* Serwowanie pytania                                                  */
/* ------------------------------------------------------------------ */

export async function serveQuestion(
  userId: string,
  sessionId: string,
  seq: number,
): Promise<ServedQuestion> {
  const db = admin();
  const session = await getOwnedSession(db, userId, sessionId);
  if (session.status !== "active") throw new QuizError("session_not_active", 409);
  return serve(db, userId, session, seq);
}

/* ------------------------------------------------------------------ */
/* Odpowiedź                                                           */
/* ------------------------------------------------------------------ */

export interface AnswerResult {
  correct: boolean;
  correctAnswer: AnswerValue;
  explanation: string | null;
  comment: string;
  xp: number;
  combo: number;
  milestoneBonus: number;
  sessionStatus: "active" | "finished";
  correctCount: number;
  answeredCount: number;
  /** Dogenerowana partia wyzwania — klient dokleja do lokalnej listy. */
  newQuestions: QuestionDto[];
}

export async function submitAnswer(
  userId: string,
  sessionId: string,
  seq: number,
  answer: AnswerValue,
): Promise<AnswerResult> {
  const db = admin();

  const { data, error } = await db.rpc("submit_answer", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_seq: seq,
    p_answer: answer,
  });
  if (error) throw mapDbError(error.message);

  const res = data as {
    correct: boolean;
    correctAnswer: AnswerValue;
    explanation: string | null;
    timeMs: number;
    xp: number;
    combo: number;
    milestoneBonus: number;
    sessionStatus: "active" | "finished";
    correctCount: number;
    answeredCount: number;
  };

  // Kontekst narratora + stan sesji — równolegle (mniej czekania na feedback).
  const [{ data: lastAnswers }, session] = await Promise.all([
    db
      .from("session_questions")
      .select("is_correct")
      .eq("session_id", sessionId)
      .not("answered_at", "is", null)
      .order("seq", { ascending: false })
      .limit(4),
    getOwnedSession(db, userId, sessionId),
  ]);
  const previous = (lastAnswers ?? []).slice(1).map((r) => r.is_correct);
  let wrongStreak = 0;
  if (!res.correct) {
    wrongStreak = 1;
    for (const c of previous) {
      if (c === false) wrongStreak += 1;
      else break;
    }
  }
  const comeback =
    res.correct && previous.length >= 2 && !previous[0] && !previous[1];

  const comment = pickComment(randomRng(), {
    correct: res.correct,
    timeMs: res.timeMs,
    combo: res.combo,
    wrongStreak,
    comeback,
  });

  // Wyzwanie: dogeneruj partię, gdy kończą się pytania; klient dostaje
  // nowe payloady w tej samej odpowiedzi i dokleja je lokalnie.
  let newQuestions: QuestionDto[] = [];
  if (session.status === "active" && session.mode === "challenge") {
    const answered = session.correct_count + session.wrong_count;
    if (session.question_count - answered < 3) {
      const prevCount = session.question_count;
      await extendChallenge(db, userId, session);
      newQuestions = await serveBatch(db, sessionId, prevCount + 1);
    }
  }

  return {
    correct: res.correct,
    correctAnswer: res.correctAnswer,
    explanation: res.explanation,
    comment,
    xp: res.xp,
    combo: res.combo,
    milestoneBonus: res.milestoneBonus,
    sessionStatus: res.sessionStatus,
    correctCount: res.correctCount,
    answeredCount: res.answeredCount,
    newQuestions,
  };
}

/** Odtwarza stan generatora z bazy i dokłada partię pytań wyzwania. */
async function extendChallenge(
  db: SupabaseClient,
  userId: string,
  session: SessionRow,
): Promise<void> {
  // Stronami — bardzo długie runy (>1000 pytań) nie mogą gubić dedupe.
  const rows = await fetchAll<{
    qtype: string;
    dedupe_key: string;
    correct_answer: AnswerValue;
  }>((from, to) =>
    db
      .from("session_questions")
      .select("qtype, dedupe_key, correct_answer")
      .eq("session_id", session.id)
      .order("seq")
      .range(from, to),
  );

  const usedKeys = new Set<string>();
  let yesCount = 0;
  let noCount = 0;
  const letterCounts: [number, number, number, number] = [0, 0, 0, 0];
  for (const r of rows) {
    usedKeys.add(r.dedupe_key);
    const ca = r.correct_answer as AnswerValue;
    if (r.qtype === "feature_yn" && "value" in ca) {
      if (ca.value === "TAK") yesCount += 1;
      else noCount += 1;
    }
    if ("index" in ca) letterCounts[ca.index] += 1;
  }

  const [snapshot, recent] = await Promise.all([
    loadCatalogSnapshot(db),
    recentTheoryIds(db, userId),
  ]);
  const state = newGenState({
    usedKeys,
    yesCount,
    noCount,
    letterCounts,
    recentTheoryIds: recent,
  });
  const batch = composeChallengeBatch(snapshot, state, randomRng());
  if (batch.length === 0) return;

  const { error } = await db.rpc("append_questions", {
    p_user_id: userId,
    p_session_id: session.id,
    p_questions: toDbRows(batch, session.question_count + 1),
  });
  if (error) throw mapDbError(error.message);
}

/* ------------------------------------------------------------------ */
/* Zakończenie                                                         */
/* ------------------------------------------------------------------ */

export interface FinishResult {
  summary: Record<string, unknown>;
  comment: string | null;
}

export async function finishSession(
  userId: string,
  sessionId: string,
): Promise<FinishResult> {
  const db = admin();
  const { data, error } = await db.rpc("finish_session", {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  if (error) throw mapDbError(error.message);

  const summary = data as Record<string, unknown>;
  let comment: string | null = null;
  const rng = randomRng();
  if (summary.mode === "challenge") {
    comment = challengeOverComment(
      rng,
      Number(summary.correct ?? 0),
      Boolean(summary.isChallengeRecord),
    );
  } else if (summary.perfect) {
    comment = perfectComment(rng);
  }
  return { summary, comment };
}
