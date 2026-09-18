import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";

/** Stable link for "my documents" that does not leak a user id into the URL. */
export default async function MyDocumentsPage() {
  const user = await requireUser();
  redirect(`/documents/${user.id}`);
}
