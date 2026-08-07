"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/db/client";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase?.auth.signOut();
    router.replace("/logowanie");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={logout}>
      Wyloguj się
    </Button>
  );
}
