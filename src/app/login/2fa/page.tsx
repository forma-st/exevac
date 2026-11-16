import { redirect } from "next/navigation";
import { pending2faUser } from "@/lib/auth";
import { TwoFactorForm } from "./Form";

export const metadata = { title: "Double authentification" };
export const dynamic = "force-dynamic";

export default async function TwoFactor() {
  const u = await pending2faUser();
  if (!u) redirect("/login");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <TwoFactorForm email={u.email} />
    </div>
  );
}
