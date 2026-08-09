"use client";

import Link from "next/link";
import { deleteQuestion, toggleQuestionActive } from "./actions";

/** Akcje wiersza listy pytań — klient tylko dla confirm() przy usuwaniu. */
export function RowActions({ id, active }: { id: string; active: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Link
        href={`/admin/pytania/${id}`}
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
      >
        Edytuj
      </Link>
      <form action={toggleQuestionActive}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="next" value={String(!active)} />
        <button
          type="submit"
          className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          {active ? "Wyłącz" : "Włącz"}
        </button>
      </form>
      <form
        action={deleteQuestion}
        onSubmit={(e) => {
          if (!confirm("Usunąć to pytanie? Tej operacji nie można cofnąć.")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Usuń
        </button>
      </form>
    </div>
  );
}
