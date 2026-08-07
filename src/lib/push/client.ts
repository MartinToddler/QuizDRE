"use client";

import { createSupabaseBrowserClient } from "@/lib/db/client";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Rejestruje SW, prosi o zgodę i zapisuje subskrypcję (RLS: własny insert). */
export async function subscribeToPush(): Promise<
  "subscribed" | "denied" | "unsupported" | "error"
> {
  if (!pushSupported()) return "unsupported";
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const supabase = createSupabaseBrowserClient();
  if (!vapid || !supabase) return "unsupported";

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "error";

    const json = subscription.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" },
    );
    if (error) return "error";
    return "subscribed";
  } catch {
    return "error";
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const supabase = createSupabaseBrowserClient();
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await supabase
      ?.from("push_subscriptions")
      .delete()
      .eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe();
  }
}

export async function hasPushSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return Boolean(subscription) && Notification.permission === "granted";
}
