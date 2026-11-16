import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FORMAST Évacuation", template: "%s · FORMAST Évacuation" },
  description: "Exercices d'évacuation : saisie sur le terrain et rapport PDF",
};

export const viewport: Viewport = { themeColor: "#cc1417" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* thème choisi sur cet appareil, appliqué avant l'affichage (sinon : réglage du système) */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("exevac-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Krub:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
