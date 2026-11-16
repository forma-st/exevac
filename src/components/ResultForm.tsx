"use client";
import { useActionState } from "react";

type Res = { ok?: string; error?: string; password?: string; email?: string } | null;

/** Formulaire relié à une action serveur, qui affiche le résultat (succès, erreur, mot de passe temporaire). */
export function ResultForm({ action, children, submit, className = "space-y-4" }: {
  action: (s: Res, f: FormData) => Promise<Res>;
  children: React.ReactNode;
  submit: string;
  className?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "…" : submit}</button>
        {state?.ok && <span className="text-sm text-emerald-700">✓ {state.ok}</span>}
        {state?.error && <span className="text-sm text-brand-600">{state.error}</span>}
      </div>
      {state?.password && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          Identifiants à transmettre : <b>{state.email}</b> / mot de passe temporaire{" "}
          <code className="rounded bg-white px-1.5 py-0.5">{state.password}</code>
        </div>
      )}
    </form>
  );
}
