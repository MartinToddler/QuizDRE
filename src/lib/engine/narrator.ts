import { pick, type Rng } from "./rng";

/**
 * Narrator QuizDRE — komentarze po odpowiedziach.
 * Ton: lekko sarkastyczny, ale też szczerze chwalący. Mało emoji.
 * Copy pisane neutralnie płciowo (bez form czasu przeszłego 2. osoby).
 */

const CORRECT = [
  "No i o to chodzi!",
  "Ktoś tu zna katalog lepiej niż własną kieszeń.",
  "Czysto, pewnie, bezbłędnie.",
  "DRE powinno Ci płacić za takie odpowiedzi.",
  "Brawo. Serio, bez ironii.",
  "Dobra odpowiedź. Aż chce się patrzeć.",
  "Tak wygląda wiedza produktowa w praniu.",
  "Klient by kupił. Od ręki.",
  "Ekspert? Ekspert.",
  "Zawiasy same się kłaniają.",
] as const;

const CORRECT_FAST = [
  "Ekspresowo. Kurz nie zdążył opaść.",
  "Refleks godny zawiasu sprężynowego.",
  "Szybciej niż zamek zapadkowy.",
  "Nawet nie mrugnęliśmy. Petarda.",
] as const;

const COMBO = [
  "Combo x{n}! Maszyna.",
  "{n} z rzędu. Robi się poważnie.",
  "Seria jak z katalogu. Dosłownie.",
  "x{n}. Ktoś tu dziś nie bierze jeńców.",
] as const;

const WRONG = [
  "Auć. Te drzwi się nie otworzą.",
  "Blisko. Ale klamka była z drugiej strony.",
  "Nie ta odpowiedź. Zdarza się najlepszym — i pozostałym też.",
  "Cóż. Przynajmniej futryna została na miejscu.",
  "To była pułapka. I zadziałała.",
  "Prawie. A „prawie” robi różnicę — zwłaszcza w drzwiach.",
  "Nic straconego. Wiedza wchodzi drugim razem.",
] as const;

const WRONG_STREAK = [
  "Może kawa? To zwykle pomaga.",
  "Spokojnie. Nikt nie patrzy. Prawie nikt.",
  "Drzwi prowadzą 2:0. Czas na rewanż.",
  "Głęboki oddech. Katalog nigdzie nie ucieka.",
] as const;

const COMEBACK = [
  "I to jest powrót!",
  "Feniks z popiołów. Albo przynajmniej z okleiny.",
  "No proszę. Forma wraca.",
] as const;

const CHALLENGE_OVER = [
  "Koniec serii na {n}. Godne pożegnanie.",
  "Wtopa po {n} poprawnych. Ale jaka seria!",
  "{n} z rzędu — a mogło być {n} plus jeden. Następnym razem.",
] as const;

const CHALLENGE_RECORD = [
  "NOWY REKORD: {n}! Ktoś tu wszedł na wyższy poziom.",
  "{n} z rzędu — rekord pobity. Szacunek.",
] as const;

const PERFECT = [
  "20/20. Bez komentarza. To znaczy — ten jeden.",
  "Perfekcja. Katalog mógłby się od Ciebie uczyć.",
] as const;

export interface NarratorContext {
  correct: boolean;
  timeMs: number;
  combo: number;
  wrongStreak: number;
  comeback: boolean;
}

export function pickComment(rng: Rng, ctx: NarratorContext): string {
  if (ctx.correct) {
    if (ctx.combo >= 5 && ctx.combo % 5 === 0) {
      return pick(rng, COMBO).replaceAll("{n}", String(ctx.combo));
    }
    if (ctx.comeback) return pick(rng, COMEBACK);
    if (ctx.timeMs >= 1000 && ctx.timeMs <= 4000) return pick(rng, CORRECT_FAST);
    return pick(rng, CORRECT);
  }
  if (ctx.wrongStreak >= 2) return pick(rng, WRONG_STREAK);
  return pick(rng, WRONG);
}

export function challengeOverComment(
  rng: Rng,
  score: number,
  isRecord: boolean,
): string {
  const deck = isRecord && score > 0 ? CHALLENGE_RECORD : CHALLENGE_OVER;
  return pick(rng, deck).replaceAll("{n}", String(score));
}

export function perfectComment(rng: Rng): string {
  return pick(rng, PERFECT);
}
