"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Logo } from "@/components/Logo";
import { verify2fa } from "../actions";

export function TwoFactorForm({ email }: { email: string }) {
  const [error, action, pending] = useActionState(verify2fa, null);
  const [recovery, setRecovery] = useState(false);
  return (
    <form action={action} className="card w-full max-w-sm space-y-4 p-6">
      <Logo className="mb-1 h-11" />
      <div>
        <h1 className="text-lg font-semibold">Double authentification</h1>
        <p className="text-sm text-slate-500">{recovery ? "Saisissez l'un de vos codes de secours." : `Saisissez le code à 6 chiffres affiché dans votre application d'authentification (${email}).`}</p>
      </div>
      <input
        name="code"
        required
        autoFocus
        autoComplete="one-time-code"
        inputMode={recovery ? "text" : "numeric"}
        pattern={recovery ? undefined : "[0-9 ]{6,7}"}
        placeholder={recovery ? "xxxxx-xxxxx" : "123 456"}
        className="input text-center font-mono text-xl tracking-widest"
        aria-label="Code"
      />
      {error && <p className="text-sm text-brand-600">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Vérification…" : "Valider"}</button>
      <div className="flex justify-between text-xs">
        <button type="button" onClick={() => setRecovery((r) => !r)} className="text-link-600 hover:underline">{recovery ? "Utiliser l'application" : "Utiliser un code de secours"}</button>
        <Link href="/login" className="text-slate-500 hover:underline">Annuler</Link>
      </div>
    </form>
  );
}
