"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { dbRows } from "@/lib/db";

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
  await requireUser();
  const f = fields(formData);
  const { error } = await dbRows("insert into features (name, description, category, price, hours) values ($1, $2, $3, $4, $5)", [
    f.name,
    f.description,
    f.category,
    f.price,
    f.hours,
  ]);
  if (error) redirect(`/catalogo?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/catalogo");
  redirect("/catalogo");
}

export async function updateFeature(id: string, formData: FormData) {
  await requireUser();
  const f = fields(formData);
  const { error } = await dbRows("update features set name = $1, description = $2, category = $3, price = $4, hours = $5 where id = $6", [
    f.name,
    f.description,
    f.category,
    f.price,
    f.hours,
    id,
  ]);
  if (error) redirect(`/catalogo?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/catalogo");
  redirect("/catalogo");
}

export async function toggleFeature(id: string, active: boolean) {
  await requireUser();
  const { error } = await dbRows("update features set active = $1 where id = $2", [active, id]);
  if (error) throw new Error(error.message);
  revalidatePath("/catalogo");
}

export async function deleteFeature(id: string) {
  await requireUser();
  const { error } = await dbRows("delete from features where id = $1", [id]);
  if (error) throw new Error(error.message);
  revalidatePath("/catalogo");
}
