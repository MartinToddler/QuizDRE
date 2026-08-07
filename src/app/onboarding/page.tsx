import { redirect } from "next/navigation";
import { SetupNotice } from "@/components/setup-notice";
import { createSupabaseServerClient } from "@/lib/db/server";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <SetupNotice />;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/logowanie");

  const [{ data: profile }, { data: companies }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, company_id, preferred_reminder_hour, onboarded_at")
      .eq("id", user.id)
      .single(),
    supabase.from("companies").select("id, name").order("name"),
  ]);

  if (profile?.onboarded_at) redirect("/");

  return (
    <OnboardingForm
      defaultName={profile?.display_name ?? ""}
      defaultHour={profile?.preferred_reminder_hour ?? 8}
      companies={companies ?? []}
    />
  );
}
