import { redirect } from "next/navigation";
import { after } from "next/server";
import { OPEN_ACCESS, requireStaff, roleLabel } from "@/lib/auth";
import { dailyMaintenance, required2faRoles } from "@/lib/security";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Écrans de bureau : rapports transférés, comptes, mon compte. */
export default async function BureauLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  if (!user.totpEnabled && (await required2faRoles()).includes(user.role)) redirect("/deux-facteurs");
  after(dailyMaintenance);
  const links = [
    { href: "/evacuation", label: "Appli terrain" },
    { href: "/rapports", label: "Rapports" },
    ...(user.role === "ADMIN" ? [{ href: "/equipe", label: "Équipe" }] : []),
    ...(OPEN_ACCESS ? [] : [{ href: "/compte", label: "Mon compte" }]),
  ];
  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-5">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <Logo className="h-9" />
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {links.map((l) => <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100">{l.label}</a>)}
          {!OPEN_ACCESS && <form action="/logout" method="post"><button className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100">Se déconnecter</button></form>}
        </nav>
      </header>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-500">{OPEN_ACCESS ? "Accès libre, sans connexion : toute personne qui connaît cette adresse voit ces rapports." : `${user.name} · ${roleLabel(user.role)}`}</p>
      <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
