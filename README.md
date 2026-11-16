# FORMAST — Exercices d'évacuation

Appli web pour téléphone et tablette (Next.js + Prisma) : le formateur chronomètre un exercice d'évacuation,
coche les repères observés, ajoute des photos, et obtient le **rapport PDF au modèle FORMAST**. Elle fonctionne
**sans réseau** une fois ouverte ; les rapports sont transférés au serveur dès que le réseau revient.

## Fonctionnement
- **Connexion privée** : un compte par formateur (créé par un administrateur), limitation des tentatives,
  double authentification (obligatoire pour les administrateurs), sessions révocables, journal de sécurité.
- **Appli terrain** (`/evacuation`) : informations du site, objectifs, scénario, particularités ; bouton **Départ**,
  un appui par repère (heure et temps depuis le départ enregistrés, « Décocher » en cas d'erreur), photos, bouton **Arrêt** ;
  procédures, chargés d'évacuation, moyens techniques, points forts et axes d'amélioration.
- **Rapport PDF** : généré sur l'appareil, même hors ligne, à partir du modèle d'origine (`src/lib/evacuation/template.ts`)
  complété aux emplacements exacts ; photos en annexe ; partage par e-mail ou messagerie depuis le téléphone.
- **Hors ligne** : les rapports sont gardés sur l'appareil (IndexedDB). Au retour du réseau, l'appli propose le transfert.
- **Bureau** : `/rapports` (un formateur voit les siens, un administrateur les voit tous), `/equipe`, `/compte`.

## Mettre en ligne (Vercel + Neon)
1. Sur https://vercel.com : « Add New… → Project », importer ce dépôt.
2. Dans « Environment Variables », ajouter `SESSION_SECRET` (une longue chaîne aléatoire, 40 caractères par exemple).
3. « Deploy » (le premier déploiement échoue : la base n'existe pas encore, c'est normal).
4. Onglet « Storage » → « Create Database » → **Neon** (Postgres) → région Europe → connecter au projet (ajoute `DATABASE_URL`).
5. Onglet « Deployments » → « Redeploy ».
6. Ouvrir l'adresse du site : la page de **première connexion** crée le compte administrateur, puis demande d'activer
   la double authentification (application Google Authenticator, Microsoft Authenticator…).
7. Dans « Équipe », créer un compte par formateur et lui transmettre son mot de passe provisoire.

Sur le téléphone du formateur : se connecter, ouvrir l'appli une première fois avec du réseau, puis
« Ajouter à l'écran d'accueil ». Elle s'ouvre ensuite sans réseau.

## Démarrer en local
```bash
npm install
cp .env.example .env      # puis ajuster DATABASE_URL
npm run db:push           # crée les tables
npm run dev               # http://localhost:3000
```
Le mode hors ligne (service worker) n'est actif qu'en production : `npm run build && npm start`.

## Transfert vers le logiciel de gestion de formation
Définir `EVACUATION_API_TOKEN` (24 caractères au moins), puis appeler avec l'en-tête `Authorization: Bearer <jeton>` :
- `GET /api/evacuation/reports?since=<date ISO>` : rapports modifiés depuis cette date ;
- `GET /api/evacuation/reports/<id>` : rapport structuré (JSON `formast.rapport-evacuation/v1`) avec les liens du PDF et des photos ;
- `GET /api/evacuation/reports/<id>/pdf` : le PDF.

L'accès par jeton est en lecture seule.

## Organisation du code
- `prisma/schema.prisma` : comptes, journal de sécurité, rapports, photos
- `src/lib/evacuation/` : modèle du rapport, génération du PDF, stockage local, synchronisation
- `src/app/evacuation/` : appli terrain · `public/evacuation-sw.js` : mise en cache pour le hors-ligne
- `src/app/api/evacuation/` : transfert, PDF, export · `src/app/(bureau)/` : rapports, équipe, compte
- `src/lib/auth.ts`, `src/lib/security.ts`, `src/app/login/` : connexion et sécurité
