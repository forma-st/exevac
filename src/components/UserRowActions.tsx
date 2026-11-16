"use client";
import { useState, useTransition } from "react";

type Res = { email?: string; password?: string } | null;

export function UserRowActions({ id, name, role, active, isMe, onRole, onActive, onReset, onDelete, onResetTotp }: {
  id: string; name: string; role: string; active: boolean; isMe: boolean;
  onRole: (id: string, role: string) => Promise<void>;
  onActive: (id: string, active: boolean) => Promise<void>;
  onReset: (id: string) => Promise<Res>;
  onDelete: (id: string) => Promise<void>;
  onResetTotp: (id: string) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [pwd, setPwd] = useState<Res>(null);
  if (isMe) return <span className="text-xs text-slate-400">C'est vous</span>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select defaultValue={role} disabled={pending} onChange={(e) => start(() => onRole(id, e.target.value))} className="input w-40 py-1.5">
        <option value="FORMATEUR">Formateur</option>
        <option value="ADMIN">Administrateur</option>
      </select>
      <button disabled={pending} onClick={() => start(() => onActive(id, !active))} className="btn-secondary py-1.5 text-xs">
        {active ? "Désactiver" : "Réactiver"}
      </button>
      <button disabled={pending} onClick={() => start(async () => setPwd(await onReset(id)))} className="btn-secondary py-1.5 text-xs">
        Nouveau mot de passe
      </button>
      <button disabled={pending} onClick={() => confirm(`Réinitialiser la double authentification de ${name} (téléphone perdu) ?`) && start(() => onResetTotp(id))} className="btn-secondary py-1.5 text-xs">
        Réinitialiser 2FA
      </button>
      <button
        disabled={pending}
        onClick={() => confirm(`Supprimer le compte de ${name} ? Ses rapports transférés sont conservés.`) && start(() => onDelete(id))}
        className="px-2 py-1.5 text-xs text-slate-400 hover:text-brand-600"
      >
        Supprimer
      </button>
      {pwd?.password && (
        <div className="basis-full rounded-lg bg-emerald-50 px-3 py-2 text-right text-xs text-emerald-800">
          Nouveau mot de passe : <code className="rounded bg-surface px-1">{pwd.password}</code>
        </div>
      )}
    </div>
  );
}
