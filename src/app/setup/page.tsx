import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SetupForm } from "./Form";

export const dynamic = "force-dynamic";

export default async function Setup() {
  if ((await db.user.count()) > 0) redirect("/");
  return <div className="flex min-h-screen items-center justify-center px-4"><SetupForm /></div>;
}
