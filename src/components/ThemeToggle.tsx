"use client";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "exevac-theme";
const OPTIONS: [Theme, string][] = [["system", "Système"], ["light", "Clair"], ["dark", "Sombre"]];

/** Choix de l'apparence, gardé sur l'appareil. « Système » suit le réglage clair / sombre du téléphone. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setTheme(t === "light" || t === "dark" ? t : "system");
  }, []);
  function choose(t: Theme) {
    setTheme(t);
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try { if (t === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* stockage indisponible */ }
  }
  return (
    <div className={`inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs ${className}`} role="group" aria-label="Apparence">
      {OPTIONS.map(([t, label], i) => (
        <button key={t} type="button" aria-pressed={theme === t} onClick={() => choose(t)}
          className={`px-2.5 py-1.5 font-medium ${i ? "border-l border-slate-300" : ""} ${theme === t ? "bg-strong text-white" : "bg-surface text-slate-600"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
