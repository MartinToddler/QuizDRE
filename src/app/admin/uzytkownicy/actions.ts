"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/admin-guard";
import { deleteUserAccount } from "@/lib/db/admin-users";

const schema = z.object({
  userId: z.string().uuid(),
  email: z.string().min(3),
});

export interface DeleteUserState {
  error?: string;
  deleted?: string;
}

export async function deleteUser(
  _prev: DeleteUserState,
  formData: FormData,
): Promise<DeleteUserState> {
  const admin = await assertAdmin();

  const parsed = schema.safeParse({
    userId: formData.get("userId"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { error: "Nieprawidłowe dane konta." };

  const { deletedEmail, error } = await deleteUserAccount(
    parsed.data.userId,
    admin.id,
    parsed.data.email,
  );
  if (error) return { error };

  revalidatePath("/admin/uzytkownicy");
  return { deleted: deletedEmail };
}
