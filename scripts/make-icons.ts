/**
 * Generuje ikony PWA z src/app/icon.svg (uruchamiane w prebuild —
 * binarne PNG nie muszą żyć w repo).
 */
import { mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";

async function main() {
  const svg = readFileSync("src/app/icon.svg");
  mkdirSync("public/icons", { recursive: true });

  await sharp(svg, { density: 300 }).resize(192, 192).png().toFile("public/icons/icon-192.png");
  await sharp(svg, { density: 300 }).resize(512, 512).png().toFile("public/icons/icon-512.png");

  // Maskable: ikona na pełnym tle z marginesem bezpieczeństwa.
  const inner = await sharp(svg, { density: 300 }).resize(400, 400).png().toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: "#fd7e14" },
  })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toFile("public/icons/icon-512-maskable.png");

  console.log("✓ Ikony PWA wygenerowane (public/icons/)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
