import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { OPEN_ACCESS, requireStaff } from "@/lib/auth";
import { required2faRoles } from "@/lib/security";
import { EvacuationApp } from "./EvacuationApp";

export const metadata: Metadata = {
  title: "Exercices d'évacuation",
  manifest: "/evacuation.webmanifest",
  appleWebApp: { capable: true, title: "Évacuation", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#cc1417", width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Appli terrain : une seule page, utilisable hors ligne une fois ouverte. */
export default async function EvacuationPage() {
  const user = await requireStaff();
  if (!user.totpEnabled && (await required2faRoles()).includes(user.role)) redirect("/deux-facteurs");
  return <EvacuationApp user={{ id: user.id, name: user.name }} open={OPEN_ACCESS} />;
}
