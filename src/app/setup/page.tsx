import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { OPEN_ACCESS, realUsers } from "@/lib/auth";
import { SetupForm } from "./Form";

export const dynamic = "force-dynamic";

export default async function Setup() {
  if (OPEN_ACCESS || (await db.user.count({ where: realUsers })) > 0) redirect("/");
  return <div className="flex min-h-screen items-center justify-center px-4"><SetupForm /></div>;
}
