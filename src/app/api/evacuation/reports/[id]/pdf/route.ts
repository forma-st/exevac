import { pdfFileName } from "@/lib/evacuation/model";
import { evacAccess, fail, loadReport, reportPdf } from "@/lib/evacuation/server";

/** Rapport PDF régénéré à la demande (même rendu que sur l'appareil du formateur). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await evacAccess(req, { allowMachine: true });
  if (a instanceof Response) return a;
  const found = await loadReport(a, (await params).id);
  if (!found) return fail("Rapport introuvable.", 404);
  const pdf = await reportPdf(found.report);
  const inline = new URL(req.url).searchParams.get("inline");
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${pdfFileName(found.report)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
