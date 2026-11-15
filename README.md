# Marchés

PWA mobile-first, en français et en thème sombre : heatmap des 25 premières cryptos et indices boursiers (Chine, USA, Europe).
Elle s'installe sur l'écran d'accueil d'un iPhone ou d'un Android.

- **Crypto** : treemap du top 25 par capitalisation, hors stablecoins (USDT, USDC, USDS, USDe, DAI…). Un appui sur une tuile ouvre son graphique TradingView en plein écran, avec un lien « Ouvrir dans TradingView ». La taille d'une tuile suit la capitalisation ; la couleur va du vert au rouge selon la variation sur 24 h. En-tête : capitalisation totale et sa variation sur 24 h, dominance BTC, nombre de cryptos en hausse et en baisse, heure de mise à jour.
- **Indices** : un appui sur une tuile ouvre son graphique TradingView. Les indices US et le FTSE 100 officiels sont bloqués dans le widget gratuit : le graphique montre alors un CFD (ou l'ETF ONEQ pour le Nasdaq Composite), avec une mention à l'écran, et « Ouvrir dans TradingView » mène à l'indice officiel.
- **Chine** : Shanghai Composite, Shenzhen Component, CSI 300, Hang Seng.
- **USA** : S&P 500, Nasdaq Composite, Dow Jones, Russell 2000.
- **Europe** : CAC 40, DAX, FTSE 100, Euro Stoxx 50, IBEX 35.
- Bouton rafraîchir, tirer-pour-rafraîchir, rafraîchissement automatique toutes les 60 s quand l'app est visible, balayage gauche/droite entre onglets.
- Hors ligne : la coquille de l'app et les dernières données restent en cache (service worker + localStorage), avec une bannière qui donne l'heure des données.
- Une donnée indisponible s'affiche « n/d ». Aucune valeur n'est jamais inventée.

## Architecture

```
public/            Front statique (HTML/CSS/JS vanilla, aucune dépendance)
  index.html       Balises PWA + iOS
  app.js           Treemap « squarified », tuiles, gestes, rafraîchissement
  styles.css
  sw.js            Service worker (coquille en cache, API network-first)
  manifest.webmanifest
  icons/           192/512, maskable, apple-touch-icon (générés par scripts/make-icons.mjs)
api/               Fonctions serverless Vercel (proxy + cache)
  crypto.js        CoinGecko → repli CoinPaprika (stablecoins exclus)
  tv.js            Trouve le symbole TradingView d'une crypto (cache 24 h)
  indices.js       Yahoo Finance chart (query1 → query2) → repli Stooq
  _lib.js          Cache mémoire + en-têtes CDN
scripts/dev-server.mjs  Serveur local qui imite Vercel (statique + /api)
```

**Cache côté serveur** : un cache mémoire de 45 s par instance de fonction, plus un cache CDN Vercel partagé (`Vercel-CDN-Cache-Control: max-age=45`). Quel que soit le nombre d'utilisateurs, les API gratuites reçoivent donc au plus environ une requête par minute et par source. Si une source tombe, la fonction renvoie la dernière réponse valide, marquée « ancienne » et horodatée.

### Sources testées (15/11/2026)

| Donnée | Source principale | Repli | Statut |
|---|---|---|---|
| Top 25 crypto | CoinGecko `/coins/markets` | CoinPaprika `/v1/tickers` | ✅ les deux répondent, sans clé |
| Global crypto | CoinGecko `/global` | CoinPaprika `/v1/global` | ✅ |
| Indices + sparkline | Yahoo `query1…/v8/finance/chart` | Yahoo `query2…`, puis Stooq (niveau seul) | ✅ Yahoo sur les 13 symboles ; Stooq non joignable depuis l'environnement de test |

Twelve Data et Finnhub n'ont pas été retenus : il leur faut une clé, et leurs offres gratuites couvrent mal les indices.

## Développement local

```bash
npm run dev          # http://localhost:5173  (Node ≥ 20, aucune installation requise)
npm run icons        # régénère les icônes (Node, sans dépendance ; aussi lancé au build Vercel)
```

## Variables d'environnement (facultatif)

| Nom | Rôle |
|---|---|
| `COINGECKO_API_KEY` | Clé « Demo » CoinGecko gratuite, utile si l'API publique limite le débit. Elle se définit dans Vercel → Project → Settings → Environment Variables, jamais dans le code. |

## Déploiement (Vercel, offre Hobby gratuite, sans carte bancaire)

Vercel déploie le dossier `public/` en statique et `api/*.js` en fonctions, sans étape de build.

1. Rendez-vous sur https://vercel.com/new et choisissez « Continue with GitHub ».
2. Importez le dépôt `OffNorth/app`. Laissez *Framework Preset* sur **Other** et ne remplissez ni build command ni output directory.
3. Cliquez sur **Deploy**. Chaque `git push` sur la branche de production redéploie ensuite le site.
4. (Facultatif) Ajoutez `COINGECKO_API_KEY` dans *Settings → Environment Variables*, puis faites *Redeploy*.

## Installer l'app

- **iPhone (Safari)** : ouvrez l'URL, touchez **Partager** (carré avec une flèche), puis **« Sur l'écran d'accueil »** et **Ajouter**.
- **Android (Chrome)** : ouvrez l'URL, touchez **Installer** dans la bannière de l'app ou dans le menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).

L'app s'ouvre ensuite en plein écran, sans barre de navigateur.

---
Information, pas un conseil financier. Les cours des indices sont différés.
