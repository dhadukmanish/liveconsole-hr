"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { readCurrentUser, setLocaleCookie } from "@/lib/auth/session";
import { localeSchema } from "@/lib/validation";

/**
 * Language is a cookie for the current browser and, when signed in, the user's
 * stored preference so it follows them to their next device.
 */
export async function changeLocale(formData: FormData) {
  const parsed = localeSchema.safeParse(formData.get("locale"));
  if (!parsed.success) return;

  await setLocaleCookie(parsed.data);

  const user = await readCurrentUser();
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { locale: parsed.data } });
  }

  revalidatePath("/", "layout");
}

export async function changeTheme(formData: FormData) {
  const value = String(formData.get("theme") ?? "system");
  if (!["light", "dark", "system"].includes(value)) return;

  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set("lc_theme", value, { path: "/", maxAge: 365 * 86_400, sameSite: "lax" });

  const user = await readCurrentUser();
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { themePref: value } });
  }

  revalidatePath("/", "layout");
}
