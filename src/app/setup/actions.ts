"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { audit, passwordProblem } from "@/lib/security";

export async function setupAdmin(_: string | null, f: FormData) {
  if ((await db.user.count()) > 0) return "L'application est déjà initialisée.";
  const name = String(f.get("name") || "").trim();
  const email = String(f.get("email") || "").trim().toLowerCase();
  const password = String(f.get("password") || "");
  if (!name || !email) return "Nom et e-mail requis.";
  const problem = passwordProblem(password, email);
  if (problem) return problem;
  const u = await db.user.create({ data: { name, email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) } });
  await createSession(u);
  await audit("USER_CREATE", { userId: u.id, email, detail: "premier administrateur" });
  redirect("/");
}
