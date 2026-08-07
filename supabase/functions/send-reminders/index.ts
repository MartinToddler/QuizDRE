// Edge Function: wysyłka przypomnień push.
// Wywoływana co godzinę przez pg_cron (supabase/setup/cron.sql) lub ręcznie:
//   curl -X POST https://<REF>.supabase.co/functions/v1/send-reminders \
//     -H "Authorization: Bearer <CRON_SECRET>"
//
// Sekrety (supabase secrets set): CRON_SECRET, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...). SB_URL i SERVICE_ROLE_KEY
// są dostępne automatycznie jako SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

interface Recipient {
  user_id: string;
  display_name: string | null;
  current_streak: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function warsawHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
}

function messageFor(kind: string, r: Recipient): { title: string; body: string } {
  if (kind === "streak_rescue") {
    return {
      title: "🔥 Seria zagrożona!",
      body: `${r.current_streak} dni serii przepadnie o północy. Szybki quiz i po sprawie.`,
    };
  }
  return {
    title: "🚪 QuizDRE czeka",
    body:
      r.current_streak > 0
        ? `Seria: ${r.current_streak} dni. 5 minut i cel dzienny z głowy.`
        : "Dzienna dawka wiedzy o drzwiach. Wejdź po swoje XP.",
  };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("forbidden", { status: 403 });
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:kontakt@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
    Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
  );

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const hour = warsawHour();
  const kinds = ["morning", ...(hour === 19 ? ["streak_rescue"] : [])];
  const stats = { sent: 0, removed: 0, failed: 0 };

  for (const kind of kinds) {
    const { data, error } = await db.rpc("get_reminder_recipients", {
      p_kind: kind,
    });
    if (error) {
      console.error(`get_reminder_recipients(${kind}):`, error.message);
      continue;
    }
    const recipients = (data ?? []) as Recipient[];

    for (const r of recipients) {
      // Log PRZED wysyłką — idempotencja przy retry crona.
      const { error: logError } = await db.from("notification_log").insert({
        user_id: r.user_id,
        kind,
        sent_on: new Date().toLocaleDateString("en-CA", {
          timeZone: "Europe/Warsaw",
        }),
      });
      if (logError) continue; // duplikat = już obsłużone

      const msg = messageFor(kind, r);
      try {
        await webpush.sendNotification(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          JSON.stringify({ ...msg, url: "/", tag: `quizdre-${kind}` }),
        );
        stats.sent += 1;
        await db
          .from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString(), failed_count: 0 })
          .eq("endpoint", r.endpoint);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("endpoint", r.endpoint);
          stats.removed += 1;
        } else {
          stats.failed += 1;
          const { data: sub } = await db
            .from("push_subscriptions")
            .select("failed_count")
            .eq("endpoint", r.endpoint)
            .maybeSingle();
          const failed = (sub?.failed_count ?? 0) + 1;
          if (failed >= 5) {
            await db.from("push_subscriptions").delete().eq("endpoint", r.endpoint);
          } else {
            await db
              .from("push_subscriptions")
              .update({ failed_count: failed })
              .eq("endpoint", r.endpoint);
          }
        }
      }
    }
  }

  return Response.json({ hour, kinds, ...stats });
});
