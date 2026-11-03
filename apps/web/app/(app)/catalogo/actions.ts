"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const num = (fd: FormData, key: string) => {
  const v = text(fd, key);
  const n = v === null ? NaN : Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const fields = (fd: FormData) => ({
  name: text(fd, "name") ?? "Feature sin nombre",
  description: text(fd, "description"),
  category: text(fd, "category") ?? "General",
  price: Math.max(0, num(fd, "price") ?? 0),
  hours: num(fd, "hours"),
});

export async function createFeature(formData: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("features").insert(fields(formData));
  if (error) redirect(`/catalogo?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/catalogo");
  redirect("/catalogo");
}

export async function updateFeature(id: string, formData: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("features").update(fields(formData)).eq("id", id);
  if (error) redirect(`/catalogo?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/catalogo");
  redirect("/catalogo");
}

export async function toggleFeature(id: string, active: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("features").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/catalogo");
}

export async function deleteFeature(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("features").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/catalogo");
}
