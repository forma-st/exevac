"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteReportButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`Supprimer définitivement le rapport « ${name} » et ses photos du serveur ? Une copie peut subsister sur l'appareil du formateur.`)) return;
    setBusy(true);
    const res = await fetch(`/api/evacuation/reports/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
    else window.alert("La suppression a échoué.");
  }
  return <button className="btn-secondary text-brand-700" disabled={busy} onClick={remove}>Supprimer</button>;
}
