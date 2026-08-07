"use client";

import { useEffect } from "react";

/** Odpala konfetti raz po zamontowaniu (odznaka, awans, rekord). */
export function ConfettiBurst({ big = false }: { big?: boolean }) {
  useEffect(() => {
    let cancelled = false;
    import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      confetti({
        particleCount: big ? 160 : 80,
        spread: big ? 100 : 70,
        origin: { y: 0.6 },
        colors: ["#fd7e14", "#f3ab4e", "#6b7280", "#ffffff"],
      });
      if (big) {
        setTimeout(
          () =>
            confetti({
              particleCount: 90,
              angle: 60,
              spread: 60,
              origin: { x: 0 },
              colors: ["#fd7e14", "#f3ab4e"],
            }),
          250,
        );
        setTimeout(
          () =>
            confetti({
              particleCount: 90,
              angle: 120,
              spread: 60,
              origin: { x: 1 },
              colors: ["#fd7e14", "#f3ab4e"],
            }),
          400,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [big]);
  return null;
}
