import { redirect } from "next/navigation";
import { OPEN_ACCESS } from "@/lib/auth";

/** En accès libre (sans comptes), les pages de connexion n'ont pas lieu d'être. */
export default function Layout({ children }: { children: React.ReactNode }) {
  if (OPEN_ACCESS) redirect("/");
  return children;
}
