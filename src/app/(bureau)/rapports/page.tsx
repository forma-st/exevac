import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { STATUS_LABEL, dateFr, type ReportStatus } from "@/lib/evacuation/model";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { DeleteReportButton } from "./DeleteReportButton";

export const metadata = { title: "Rapports" };

const STATUS_STYLE: Record<string, string> = { BROUILLON: "bg-slate-100 text-slate-600", EN_COURS: "bg-amber-100 text-amber-800", TERMINE: "bg-emerald-100 text-emerald-800" };

export default async function Evacuations() {
  const user = await requireStaff();
  const rows = await db.evacuationReport.findMany({
    where: user.role === "ADMIN" ? {} : { userId: user.id }, orderBy: [{ exerciseDate: "desc" }, { updatedAt: "desc" }], take: 300,
    select: { id: true, userId: true, clientName: true, address: true, exerciseDate: true, status: true, authorName: true, updatedAt: true, _count: { select: { photos: true } } },
  });
  return (
    <>
      <PageHeader
        title="Rapports transférés"
        subtitle={user.role === "ADMIN" ? "Rapports de tous les formateurs, transférés depuis l'appli terrain." : "Vos rapports transférés depuis l'appli terrain."}
        actions={<a href="/evacuation" className="btn-primary">Ouvrir l'appli terrain</a>}
      />
      <Card>
        {!rows.length ? (
          <Empty>Aucun rapport transféré pour l'instant. Les formateurs saisissent leurs exercices dans l'appli terrain, puis les transfèrent ici.</Empty>
        ) : (
          <div className="-m-5 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Date</th><th>Client / site</th><th>Formateur</th><th>État</th><th>Photos</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{dateFr(r.exerciseDate) || "—"}</td>
                    <td>
                      <span className="font-medium">{r.clientName || "Sans nom"}</span>
                      {r.address && <div className="text-xs text-slate-500">{r.address}</div>}
                    </td>
                    <td>{r.authorName}</td>
                    <td><Badge className={STATUS_STYLE[r.status] ?? STATUS_STYLE.BROUILLON}>{STATUS_LABEL[r.status as ReportStatus] ?? r.status}</Badge></td>
                    <td>{r._count.photos}</td>
                    <td className="text-right whitespace-nowrap">
                      <a href={`/api/evacuation/reports/${r.id}/pdf?inline=1`} target="_blank" rel="noreferrer" className="btn-secondary">PDF</a>{" "}
                      <a href={`/api/evacuation/reports/${r.id}`} target="_blank" rel="noreferrer" className="btn-secondary" title="Données structurées, pour le logiciel de gestion de formation">JSON</a>{" "}
                      {(user.role === "ADMIN" || r.userId === user.id) && <DeleteReportButton id={r.id} name={r.clientName || "Sans nom"} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
