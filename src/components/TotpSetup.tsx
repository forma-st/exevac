"use client";
import Link from "next/link";
import { useActionState } from "react";
import type { TotpState } from "@/app/deux-facteurs/actions";

export function RecoveryCodes({ codes, next }: { codes: string[]; next?: string }) {
  const text = `Codes de secours — FORMAST Évacuation\n${codes.join("\n")}\n\nChaque code ne fonctionne qu'une fois.`;
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">✓ Double authentification activée.</div>
      <p className="text-sm"><b>Conservez ces codes de secours</b> en lieu sûr (gestionnaire de mots de passe, papier sous clé). Ils permettent de vous connecter si vous perdez votre téléphone. Ils ne seront plus affichés.</p>
      <ul className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => navigator.clipboard.writeText(text)} className="btn-secondary">Copier</button>
        <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="codes-de-secours-formast-crm.txt" className="btn-secondary">Télécharger</a>
        {next && <Link href={next} className="btn-primary">J'ai conservé mes codes — continuer</Link>}
      </div>
    </div>
  );
}

export function TotpEnrollForm({ action, next, enabled }: { action: (s: TotpState, f: FormData) => Promise<TotpState>; next: string; enabled?: boolean }) {
  const [state, run, pending] = useActionState(action, null);
  if (state?.codes) return <RecoveryCodes codes={state.codes} next={next} />;
  if (enabled)
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">✓ La double authentification est déjà activée sur votre compte.</div>
        <Link href={next} className="btn-primary">Continuer</Link>
      </div>
    );
  return (
    <form action={run} className="space-y-3">
      <label className="block">
        <span className="label">Code à 6 chiffres affiché par l'application</span>
        <input name="code" required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 ]{6,7}" placeholder="123 456" className="input text-center font-mono text-xl tracking-widest" />
      </label>
      {state?.error && <p className="text-sm text-brand-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Vérification…" : "Activer la double authentification"}</button>
    </form>
  );
}
