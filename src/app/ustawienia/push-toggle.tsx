"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  hasPushSubscription,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push/client";

export function PushToggle() {
  const [state, setState] = useState<
    "loading" | "unsupported" | "on" | "off" | "denied"
  >("loading");

  useEffect(() => {
    (async () => {
      if (!pushSupported()) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      setState((await hasPushSubscription()) ? "on" : "off");
    })();
  }, []);

  async function toggle() {
    if (state === "on") {
      setState("loading");
      await unsubscribeFromPush();
      setState("off");
    } else if (state === "off") {
      setState("loading");
      const result = await subscribeToPush();
      setState(result === "subscribed" ? "on" : result === "denied" ? "denied" : "off");
    }
  }

  if (state === "unsupported") {
    return (
      <p className="text-sm text-gray-500">
        Ta przeglądarka nie wspiera powiadomień push. Na iPhonie: dodaj
        aplikację do ekranu początkowego (Udostępnij → „Do ekranu początkowego”),
        a opcja się pojawi.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="text-sm text-gray-500">
        Powiadomienia są zablokowane w ustawieniach przeglądarki — odblokuj je
        dla tej strony, aby włączyć przypomnienia.
      </p>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-semibold">
          Przypomnienia push {state === "on" ? "włączone" : "wyłączone"}
        </p>
        <p className="text-sm text-gray-500">
          Poranne przypomnienie + alarm, gdy seria jest zagrożona (ok. 19:00).
        </p>
      </div>
      <Button
        variant={state === "on" ? "secondary" : "primary"}
        size="sm"
        onClick={toggle}
        disabled={state === "loading"}
      >
        {state === "loading" ? "…" : state === "on" ? "Wyłącz" : "Włącz"}
      </Button>
    </div>
  );
}
