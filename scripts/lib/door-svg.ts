/**
 * Generator placeholderowych zdjęć drzwi (SVG → PNG przez sharp).
 * Rysuje drzwi z klamką po zadanej stronie, więc pytania „prawe/lewe”
 * działają realistycznie zanim pojawią się prawdziwe zdjęcia.
 */

export interface DoorSvgOptions {
  /** Wyświetlana orientacja: right = zawiasy po prawej → klamka po lewej. */
  orientation: "left" | "right";
  leafColor: string;
  variant: number;
}

/**
 * UWAGA: obraz celowo BEZ tekstu — napis zdradzałby nazwę modelu (typ 3),
 * a po odbiciu lustrzanym — sam fakt odbicia (typ 2).
 */
export function doorSvg({ orientation, leafColor, variant }: DoorSvgOptions): string {
  const W = 600;
  const H = 900;
  // zawiasy po prawej (drzwi prawe) → klamka przy lewej krawędzi skrzydła
  const handleX = orientation === "right" ? 150 : 450;
  const hingeX = orientation === "right" ? 452 : 148;

  const panels =
    variant % 3 === 0
      ? `<rect x="200" y="180" width="200" height="240" rx="6" fill="rgba(255,255,255,0.28)"/>
         <rect x="200" y="470" width="200" height="240" rx="6" fill="rgba(255,255,255,0.28)"/>`
      : variant % 3 === 1
        ? `<rect x="190" y="160" width="220" height="560" rx="6" fill="rgba(255,255,255,0.22)"/>`
        : `<rect x="200" y="170" width="200" height="120" rx="6" fill="rgba(0,0,0,0.10)"/>
           <rect x="200" y="320" width="200" height="120" rx="6" fill="rgba(0,0,0,0.10)"/>
           <rect x="200" y="470" width="200" height="120" rx="6" fill="rgba(0,0,0,0.10)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f6f6f6"/>
  <rect x="110" y="70" width="380" height="770" rx="8" fill="#d9d9d9"/>
  <rect x="130" y="90" width="340" height="740" rx="6" fill="${leafColor}"/>
  ${panels}
  <circle cx="${handleX}" cy="460" r="14" fill="#3a3a3a"/>
  <rect x="${handleX - (orientation === "right" ? 0 : 60)}" y="452" width="60" height="12" rx="6" fill="#3a3a3a"/>
  <rect x="${hingeX}" y="200" width="14" height="46" rx="3" fill="#8a8a8a"/>
  <rect x="${hingeX}" y="430" width="14" height="46" rx="3" fill="#8a8a8a"/>
  <rect x="${hingeX}" y="660" width="14" height="46" rx="3" fill="#8a8a8a"/>
</svg>`;
}
