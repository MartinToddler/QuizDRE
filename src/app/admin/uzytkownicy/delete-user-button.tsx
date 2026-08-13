"use client";

import { useActionState } from "react";
import { deleteUser, type DeleteUserState } from "./actions";

/**
 * Trwałe usunięcie konta i postępu. Potwierdzenie przez PRZEPISANIE adresu —
 * przypadkowe kliknięcie nic nie zrobi.
 */
export function DeleteUserButton({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const [state, formAction, pending] = useActionState<DeleteUserState, FormData>(
    deleteUser,
    {},
  );

  if (state.deleted) {
    return <span className="text-xs text-gray-400">usunięto ✓</span>;
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const typed = window.prompt(
          `Trwale usunąć konto ${email} wraz z całym postępem gry?\n\n` +
            `Operacji nie można cofnąć. Wpisz adres, aby potwierdzić:`,
        );
        if ((typed ?? "").trim().toLowerCase() !== email.toLowerCase()) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:text-gray-400"
      >
        {pending ? "Usuwanie…" : "Usuń"}
      </button>
      {state.error && (
        <p className="mt-1 max-w-48 text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}
