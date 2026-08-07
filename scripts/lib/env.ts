import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Minimalny loader .env(.local) dla skryptów CLI — bez zależności. */
export function loadEnv(): void {
  for (const file of [".env", ".env.local"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of content.split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const [, key, raw] = m;
        if (process.env[key] !== undefined) continue;
        process.env[key] = raw.replace(/^["']|["']$/g, "");
      }
    } catch {
      // brak pliku — OK
    }
  }
}
