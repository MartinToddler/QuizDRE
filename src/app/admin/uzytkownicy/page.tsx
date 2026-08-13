import { Card } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/admin-guard";
import { countActiveSince, listUsersWithStats } from "@/lib/db/admin-users";
import { rankForXp } from "@/lib/engine";
import { DeleteUserButton } from "./delete-user-button";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function AdminUsersPage() {
  const admin = await requireAdminPage();
  const users = await listUsersWithStats();

  const activeWeek = countActiveSince(users, 7);

  return (
    <div>
      <h1 className="text-2xl font-bold">Użytkownicy</h1>
      <p className="mt-1 text-sm text-gray-500">
        Kont: <span className="font-semibold text-gray-700">{users.length}</span> ·
        aktywni w ostatnich 7 dniach:{" "}
        <span className="font-semibold text-gray-700">{activeWeek}</span>
      </p>

      <Card className="mt-5 overflow-x-auto p-0">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Użytkownik</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Ostatnie logowanie</th>
              <th className="px-4 py-3">Ostatnia aktywność</th>
              <th className="px-4 py-3 text-right">🔥 Seria</th>
              <th className="px-4 py-3 text-right">XP</th>
              <th className="px-4 py-3 text-right">Odpowiedzi</th>
              <th className="px-4 py-3 text-right">Celność</th>
              <th className="px-4 py-3 text-right">Konto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const accuracy =
                u.questionsAnswered > 0
                  ? Math.round((u.correctAnswers / u.questionsAnswered) * 100)
                  : null;
              return (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">
                      {u.displayName}
                      {u.isAdmin && <span title="Administrator"> 🛡️</span>}
                    </p>
                    <p className="text-xs text-gray-400">{u.companyName ?? "bez firmy"}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(u.lastSignInAt)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(u.lastActivityAt)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                    {u.currentStreak}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold text-gray-800">{u.totalXp}</p>
                    <p className="text-xs text-gray-400">{rankForXp(u.totalXp).name}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {u.questionsAnswered}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {accuracy === null ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <span
                        className={
                          accuracy >= 80
                            ? "font-semibold text-green-700"
                            : accuracy >= 60
                              ? "font-semibold text-amber-600"
                              : "font-semibold text-red-600"
                        }
                      >
                        {accuracy}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.id === admin.id ? (
                      <span className="text-xs text-gray-400">to Ty</span>
                    ) : (
                      <div className="flex justify-end">
                        <DeleteUserButton userId={u.id} email={u.email} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-500">
            Brak użytkowników do wyświetlenia.
          </p>
        )}
      </Card>

      <p className="mt-3 text-xs text-gray-400">
        Ostatnia aktywność = ostatnia odpowiedź w quizie (samo logowanie jej nie
        zmienia). Celność: zielona ≥ 80%, bursztynowa ≥ 60%.
      </p>
      <p className="mt-1.5 text-xs text-gray-400">
        „Usuń” kasuje konto wraz z całym postępem (XP, odznaki, historia sesji,
        wyniki w rankingach) — bez możliwości cofnięcia. Adres e-mail wraca do
        obiegu, więc można nim od razu przejść rejestrację od zera. Wymagane
        potwierdzenie przez przepisanie adresu; własnego konta usunąć nie można.
      </p>
    </div>
  );
}
