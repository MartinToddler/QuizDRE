import "server-only";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/db/roles";
import { getSessionUser } from "@/lib/db/server";

/** Strażnik STRON panelu admina — brak sesji/roli kończy się przekierowaniem. */
export async function requireAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/logowanie");
  if (!(await isAdmin(user.id))) redirect("/");
  return user;
}

/** Strażnik SERVER ACTIONS panelu — rzuca zamiast przekierowywać. */
export async function assertAdmin() {
  const user = await getSessionUser();
  if (!user || !(await isAdmin(user.id))) {
    throw new Error("forbidden");
  }
  return user;
}
