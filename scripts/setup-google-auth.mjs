#!/usr/bin/env node
/**
 * QuizDRE — konfigurator logowania Google w Supabase.
 *
 * Robi za Ciebie całą część po stronie Supabase:
 *   1. włącza provider Google (Client ID + Secret),
 *   2. ustawia Site URL i listę dozwolonych adresów powrotu (redirect),
 *   3. na żywo weryfikuje, że logowanie Google wystartuje poprawnie,
 *      i podpowiada, co poprawić, jeśli nie.
 *
 * Uruchomienie (Windows / macOS / Linux, wymagany Node 18+, zero instalacji):
 *   node scripts/setup-google-auth.mjs
 *
 * Skrypt zapyta o wszystko, czego potrzebuje. Można też podać wartości
 * z góry przez zmienne środowiskowe i uruchomić bez pytań:
 *   SUPABASE_ACCESS_TOKEN=sbp_...  PROJECT_REF=abcdefgh...
 *   GOOGLE_CLIENT_ID=....apps.googleusercontent.com  GOOGLE_CLIENT_SECRET=GOCSPX-...
 *   PROD_URL=https://quizdre.vercel.app
 *
 * Jest idempotentny — można go uruchamiać wielokrotnie (np. żeby dopisać
 * nową domenę po deployu). Token sbp_ możesz po wszystkim unieważnić:
 * https://supabase.com/dashboard/account/tokens
 */

import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const API = "https://api.supabase.com/v1";

/* ------------------------------------------------------------------ */
/* Pomocnicze                                                          */
/* ------------------------------------------------------------------ */

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function fail(msg) {
  console.error(`\n${c.red("✗ " + msg)}`);
  process.exit(1);
}

function readEnvLocal() {
  const out = {};
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
      if (m && !(m[1] in out)) out[m[1]] = m[2].trim();
    }
  }
  return out;
}

function refFromUrl(url) {
  const m = (url ?? "").match(/^https?:\/\/([a-z0-9]{15,})\.supabase\.co\/?$/);
  return m ? m[1] : null;
}

const rl = createInterface({ input: stdin, output: stdout });

// Ctrl+C / EOF w trakcie pytania → czytelne wyjście zamiast zwisu.
let awaitingInput = false;
const noInputMsg =
  "Brak dostępnego wejścia — uruchom w zwykłym terminalu albo podaj " +
  "wartości przez zmienne środowiskowe (patrz nagłówek pliku).";
rl.on("close", () => {
  if (awaitingInput) {
    console.error(`\n${c.red("✗ Przerwano.")} ${noInputMsg}`);
    process.exit(1);
  }
});

async function ask(question, { def, validate, hint } = {}) {
  for (;;) {
    if (hint) console.log(c.dim(hint));
    const suffix = def ? ` ${c.dim(`[Enter = ${def}]`)}` : "";
    let raw;
    awaitingInput = true;
    try {
      raw = (await rl.question(`${question}${suffix}: `)).trim();
    } catch {
      fail(noInputMsg);
    } finally {
      awaitingInput = false;
    }
    const value = raw || def || "";
    const problem = validate ? validate(value) : null;
    if (!problem) return value;
    console.log(c.yellow(`  ${problem}`));
  }
}

/** Pytanie o sekret — znaki maskowane gwiazdkami. */
function askHidden(question) {
  if (!stdin.isTTY) fail(noInputMsg);
  return new Promise((resolve) => {
    stdout.write(`${question}: `);
    rl.pause(); // nie mieszaj readline z trybem raw
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    let value = "";
    const done = () => {
      stdin.off("data", onData);
      if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
      rl.resume();
      stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          done();
          resolve(value.trim());
          return;
        } else if (ch === "\u0003") {
          // Ctrl+C
          done();
          process.exit(130);
        } else if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
        } else if (ch >= " ") {
          value += ch;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function api(pat, path, init = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch (e) {
    fail(
      `Brak połączenia z api.supabase.com (${e?.cause?.code ?? e.message}).\n` +
        "  Sprawdź internet / firewall / proxy i spróbuj ponownie.",
    );
  }
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

/* ------------------------------------------------------------------ */
/* Główny przebieg                                                     */
/* ------------------------------------------------------------------ */

const [major] = process.versions.node.split(".").map(Number);
if (major < 18) fail(`Wymagany Node 18+ (masz ${process.versions.node}).`);

console.log(c.bold("\n🔧 QuizDRE — konfigurator logowania Google w Supabase\n"));

const env = readEnvLocal();
const envRef = refFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);

// 1. REF projektu
const ref =
  process.env.PROJECT_REF ??
  (await ask("Ref projektu Supabase", {
    def: envRef ?? undefined,
    hint:
      "To fragment adresu projektu: https://REF.supabase.co (Dashboard → Project Settings → General).",
    validate: (v) =>
      /^[a-z0-9]{15,}$/.test(v)
        ? null
        : "Ref to 15+ małych liter/cyfr — sam identyfikator, bez https:// i .supabase.co.",
  }));

// 2. Token dostępu (Personal Access Token)
let pat = process.env.SUPABASE_ACCESS_TOKEN;
if (!pat) {
  console.log(
    c.dim(
      "\nPotrzebny jednorazowy token konta Supabase (nie klucz projektu!):\n" +
        "  https://supabase.com/dashboard/account/tokens → Generate new token\n" +
        "  (po zakończeniu możesz go tam unieważnić)",
    ),
  );
  pat = await askHidden("Token dostępu (sbp_…)");
}
if (!/^sbp_[A-Za-z0-9_]{20,}$/.test(pat)) {
  fail("To nie wygląda na token sbp_… — wygeneruj go na stronie tokenów konta.");
}

// 3. Google Client ID + Secret
const clientId =
  process.env.GOOGLE_CLIENT_ID ??
  (await ask("Google Client ID", {
    hint:
      "\nZ Google Cloud Console (kończy się na .apps.googleusercontent.com).\n" +
      "Jeszcze go nie masz? Utwórz wg README → „Logowanie Google + deploy”.",
    validate: (v) =>
      v.endsWith(".apps.googleusercontent.com")
        ? null
        : "Client ID kończy się na .apps.googleusercontent.com.",
  }));

let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientSecret) {
  clientSecret = await askHidden("Google Client Secret (GOCSPX-…)");
}
if (!clientSecret) fail("Client Secret nie może być pusty.");
if (!clientSecret.startsWith("GOCSPX-")) {
  console.log(
    c.yellow(
      "  Uwaga: nowe sekrety Google zaczynają się od GOCSPX- — upewnij się, że to Client Secret, nie ID.",
    ),
  );
}

// 4. Adres produkcyjny (Vercel)
const prodUrl = (
  process.env.PROD_URL ??
  (await ask("Adres aplikacji na Vercel (Enter = pomiń, zostanie localhost)", {
    def: "",
    validate: (v) =>
      v === "" || /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(v.replace(/\/$/, ""))
        ? null
        : "Podaj pełny adres https://… (bez ścieżki) albo Enter, by pominąć.",
  }))
).replace(/\/$/, "");

/* --- Odczyt obecnej konfiguracji ---------------------------------- */

console.log(c.dim("\n→ Czytam obecną konfigurację auth…"));
const current = await api(pat, `/projects/${ref}/config/auth`);
if (current.status === 401) {
  fail("Token odrzucony (401). Wygeneruj nowy: https://supabase.com/dashboard/account/tokens");
}
if (current.status === 404) {
  fail(`Projekt „${ref}” nieznaleziony (404) — sprawdź ref albo czy token należy do właściwego konta.`);
}
if (current.status !== 200) {
  fail(`Nieoczekiwana odpowiedź API (${current.status}): ${JSON.stringify(current.body)}`);
}

const cfg = current.body;
console.log("  Stan przed zmianą:");
console.log(`    Google enabled : ${cfg.external_google_enabled ? c.green("TAK") : c.red("NIE")}`);
console.log(
  `    Client ID      : ${cfg.external_google_client_id ? c.dim(String(cfg.external_google_client_id).slice(0, 12) + "…") : c.dim("(brak)")}`,
);
console.log(`    Site URL       : ${cfg.site_url || c.dim("(brak)")}`);
console.log(`    Redirect list  : ${cfg.uri_allow_list || c.dim("(pusta)")}`);

/* --- Budowa i zapis nowej konfiguracji ----------------------------- */

// Site URL: nowy adres z Vercela > dotychczasowy https > localhost.
const keepExisting = /^https:\/\//.test(cfg.site_url ?? "");
const siteUrl = prodUrl || (keepExisting ? cfg.site_url : "http://localhost:3000");
const allow = new Set(
  (cfg.uri_allow_list || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
allow.add("http://localhost:3000/**");
if (prodUrl) allow.add(`${prodUrl}/**`);

const patch = {
  external_google_enabled: true,
  external_google_client_id: clientId,
  external_google_secret: clientSecret,
  site_url: siteUrl,
  uri_allow_list: [...allow].join(","),
};

console.log(c.dim("\n→ Zapisuję nową konfigurację…"));
const saved = await api(pat, `/projects/${ref}/config/auth`, {
  method: "PATCH",
  body: JSON.stringify(patch),
});
if (saved.status !== 200) {
  fail(`Zapis nie powiódł się (${saved.status}): ${JSON.stringify(saved.body)}`);
}
console.log(c.green("  ✓ Zapisano:"));
console.log(`    Google enabled : TAK`);
console.log(`    Site URL       : ${patch.site_url}`);
console.log(`    Redirect list  : ${patch.uri_allow_list}`);

/* --- Weryfikacja na żywo ------------------------------------------- */

console.log(c.dim("\n→ Weryfikuję na żywo endpoint logowania…"));
const expectedRedirect = `https://${ref}.supabase.co/auth/v1/callback`;
let verdict = "FAIL";
let advice = "";

try {
  const res = await fetch(
    `https://${ref}.supabase.co/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(
      `${patch.site_url}/auth/callback`,
    )}`,
    { redirect: "manual" },
  );

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location") ?? "";
    const url = new URL(loc);
    const gotClient = url.searchParams.get("client_id");
    const gotRedirect = url.searchParams.get("redirect_uri");
    if (!loc.includes("accounts.google.com")) {
      advice = `Przekierowanie nie prowadzi do Google (${url.host}) — provider błędnie skonfigurowany.`;
    } else if (gotClient !== clientId) {
      advice = `Supabase używa innego Client ID (${gotClient?.slice(0, 12)}…) niż podany — odśwież konfigurację.`;
    } else if (gotRedirect !== expectedRedirect) {
      advice = `redirect_uri = ${gotRedirect}, oczekiwano ${expectedRedirect}.`;
    } else {
      verdict = "PASS";
    }
  } else if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    advice = `${body.msg ?? body.message ?? "bad request"} — provider wygląda na wyłączony; uruchom skrypt ponownie.`;
  } else {
    advice = `Nieoczekiwany status ${res.status}.`;
  }
} catch (e) {
  verdict = "SKIP";
  advice = `Nie udało się połączyć z https://${ref}.supabase.co (${e?.cause?.code ?? e.message}) — sprawdź ręcznie logowanie w aplikacji.`;
}

console.log("");
if (verdict === "PASS") {
  console.log(c.green(c.bold("✓ WERYFIKACJA: PASS — Supabase poprawnie startuje logowanie Google.")));
  console.log(`
${c.bold("Zostało tylko po stronie Google (jeśli jeszcze nie zrobione):")}
  W Google Cloud Console Twój OAuth Client musi mieć w polu
  ${c.bold("Authorized redirect URIs")} DOKŁADNIE:
    ${c.bold(expectedRedirect)}
  Jeśli przy logowaniu zobaczysz „redirect_uri_mismatch” — poprawiasz właśnie to pole.

${c.bold("Test końcowy:")} otwórz ${patch.site_url}/logowanie i kliknij „Kontynuuj z Google”.
${c.dim(`Token sbp_ możesz teraz unieważnić: https://supabase.com/dashboard/account/tokens`)}`);
} else if (verdict === "SKIP") {
  console.log(c.yellow(c.bold("⚠ WERYFIKACJA POMINIĘTA: ")) + advice);
} else {
  console.log(c.red(c.bold("✗ WERYFIKACJA: FAIL — ")) + advice);
  process.exitCode = 1;
}

rl.close();
