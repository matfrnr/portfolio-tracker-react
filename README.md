# 📈 Portfolio Tracker — Suivi de Portefeuille Boursier

Application moderne de suivi et d'analyse de portefeuille d'actifs financiers (actions, ETF, cryptos) construite avec **React**, **Vite**, **Express** et **Prisma (SQLite)**.

---

## ⚡ Démarrage Rapide

L'application est composée de deux parties distinctes :
1. Le **Backend API** (`server`) qui gère la base de données SQLite et les cotations boursières en direct.
2. Le **Frontend Web** (`client`) sous React & Vite.

> [!NOTE]
> Cette application utilise **React / Vite**, et **non Angular**. N'utilisez pas `ng serve`, mais `npm run dev`.

---

### Option 1 : Lancement standard (Recommandé - 2 terminaux)

Ouvrez deux terminaux dans le dossier racine du projet :

#### Terminal 1 — Lancer le Serveur Backend (API)
```bash
cd server
npm install    # (uniquement lors de la première installation)
npm run dev
```
*Le serveur sera accessible sur : **`http://localhost:3001`***

---

#### Terminal 2 — Lancer le Client Web (Interface)
```bash
cd client
npm install    # (uniquement lors de la première installation)
npm run dev
```
*L'interface s'ouvrira sur : **`http://localhost:5173`***

---

### Option 2 : Commandes depuis la racine du projet

Un fichier `package.json` à la racine vous permet également de lancer les services :

```bash
# Lancer le serveur backend
npm run dev:server

# Lancer le client frontend (dans un autre terminal)
npm run dev:client
```

---

## 🧭 Fonctionnalités de l'Application

- 📊 **Tableau de bord interactif** :
  - **Graphique Donut** (Recharts) d'allocation du portefeuille par actif.
  - **Graphique à barres** des plus-values et moins-values latentes (€) par ligne.
  - **KPIs en temps réel** : Valeur totale, capital investi, plus-values latentes et réalisées, rendement global.
- 💼 **Positions ouvertes** :
  - Valorisation en temps réel (Qté × Cours).
  - Poids de chaque ligne dans le portefeuille (%).
  - Bouton **"Actualiser les cours"** en un clic pour interroger le marché en direct.
  - Actions rapides **Achat** et **Vente** directement sur chaque ligne.
  - Tri multi-colonnes et barre de recherche instantanée.
- ➕ **Enregistrement de transactions** :
  - **Autocomplétion dynamique** : tapez un symbole ou un nom d'entreprise (ex. *AAPL*, *MC.PA*, *CW8.PA*...) pour récupérer automatiquement son cours en direct et son nom.
  - Contrôle anti-survente empêchant d'enregistrer une vente supérieure aux parts détenues.
  - Calcul instantané du montant brut, des frais et du montant net crédité ou débité.
- 📜 **Historique des opérations** :
  - Journal complet triable et filtrable par type (*Tous*, *Achats*, *Ventes*) ou par mot-clé.
  - Modification et suppression sécurisée avec boîte de dialogue de confirmation.
- 💾 **Sauvegarde & Portabilité** :
  - Exportation complète du portefeuille au format **JSON**.
  - Réimportation facile à tout moment.

---

## 🛠️ Stack Technique

- **Frontend** : React 18, Vite, Recharts, Lucide React, Vanilla CSS moderne (design fintech responsive avec dark mode automatique).
- **Backend** : Node.js, Express, Prisma ORM, SQLite (`dev.db`), API Quotes en direct.

---

## ❓ En cas de problème

- **Erreur "port déjà utilisé" (3001 ou 5173)** :
  Assurez-vous qu'aucun autre processus ne tourne sur ces ports ou redémarrez votre terminal.
- **Les cours ne s'actualisent pas** :
  Vérifiez que votre connexion Internet est active et que le serveur backend (`http://localhost:3001`) est bien démarré.
