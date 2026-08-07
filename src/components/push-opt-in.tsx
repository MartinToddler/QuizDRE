"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { pushSupported, subscribeToPush } from "@/lib/push/client";

const DISMISS_KEY = "quizdre.push.dismissed";

/**
 * Miękka prośba o powiadomienia — pokazywana na ekranie wyników
 * (po pierwszym sukcesie, nie na starcie aplikacji).
 */
export function PushOptInCard() {
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  useEffect(() => {
    // Warunki tylko-przeglądarkowe — sprawdzane po pierwszym renderze.
    const timer = setTimeout(() => {
      if (!pushSupported()) return;
      if (Notification.permission !== "default") return;
      if (localStorage.getItem(DISMISS_KEY)) return;
      setVisible(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  async function enable() {
    setState("busy");
    const result = await subscribeToPush();
    if (result === "subscribed") {
      setState("done");
      setTimeout(() => setVisible(false), 2000);
    } else {
      localStorage.setItem(DISMISS_KEY, "1");
      setVisible(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <Card className="border-dre-200">
      {state === "done" ? (
        <p className="text-center text-sm font-semibold text-green-700">
          Przypomnienia włączone. Seria jest bezpieczniejsza. ✓
        </p>
      ) : (
        <>
          <p className="font-bold">🔔 Nie przerywaj serii</p>
          <p className="mt-1 text-sm text-gray-600">
            Włącz codzienne przypomnienie — dostaniesz też sygnał, gdy seria
            będzie zagrożona.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={enable} disabled={state === "busy"}>
              Włącz przypomnienia
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Może później
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
