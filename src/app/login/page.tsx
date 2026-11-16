"use client";
import { useActionState } from "react";
import { login } from "./actions";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <Logo className="mb-3 h-11" />
          <p className="text-sm text-slate-500">Exercices d'évacuation · accès réservé</p>
        </div>
        <label className="block">
          <span className="label">E-mail</span>
          <input name="email" type="email" required className="input" autoComplete="email" />
        </label>
        <label className="block">
          <span className="label">Mot de passe</span>
          <input name="password" type="password" required className="input" autoComplete="current-password" />
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
