import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { listCompanies } from "@/lib/db/companies";
import { isAdmin } from "@/lib/db/roles";
import { createSupabaseServerClient } from "@/lib/db/server";
import { LogoutButton } from "./logout-button";
import { PushToggle } from "./push-toggle";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/logowanie");

  const [{ data: profile }, companies, admin] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, company_id, preferred_reminder_hour")
      .eq("id", user.id)
      .maybeSingle(),
    listCompanies(),
    isAdmin(user.id),
  ]);

  return (
    <AppShell active="profil">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Ustawienia</h1>

        <Card>
          <h2 className="mb-3 font-bold">Profil</h2>
          <SettingsForm
            defaults={{
              displayName: profile?.display_name ?? "",
              companyId: profile?.company_id ?? "",
              reminderHour: profile?.preferred_reminder_hour ?? 8,
            }}
            companies={companies}
          />
        </Card>

        <Card>
          <h2 className="mb-3 font-bold">Powiadomienia</h2>
          <PushToggle />
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Konto</h2>
            {admin && <Chip tone="orange">🛡️ Administrator</Chip>}
          </div>
          <p className="mb-3 text-sm text-gray-500">{user.email}</p>
          <LogoutButton />
        </Card>
      </div>
    </AppShell>
  );
}
