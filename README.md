# Marchés

PWA mobile-first, en français et en thème sombre : heatmap des 25 premières cryptos et indices boursiers (Chine, USA, Europe).
Elle s'installe sur l'écran d'accueil d'un iPhone ou d'un Android.

- **Crypto** : treemap du top 25, 50 ou 100 par capitalisation (au choix), hors stablecoins (USDT, USDC, USDS, USDe, DAI…). Un appui sur une tuile ouvre son graphique TradingView en plein écran, avec un lien « Ouvrir dans TradingView ». La taille d'une tuile suit la capitalisation, sauf celle du BTC, plafonnée à 35 % de la surface pour laisser de la place aux autres (mention « BTC réduit » dans la légende) ; la couleur va du vert au rouge selon la variation sur la période choisie : 1 h, 24 h ou 7 j. En-tête : capitalisation totale et sa variation sur 24 h, dominance BTC, nombre de cryptos en hausse et en baisse, heure de mise à jour.
- **Actions** : heatmap des 25, 50 ou 100 plus grosses entreprises cotées du monde (taille = capitalisation, couleur = variation de la séance), avec logos et graphique TradingView au toucher. Classement : CSV public de companiesmarketcap.com (cache 1 h) ; cours et variation : Yahoo Finance. Les places bloquées dans le widget TradingView (Séoul, Riyad, Hong Kong, Taïwan, Londres, Tokyo, NSE) n'ont que le lien « Ouvrir dans TradingView ».
- **Réglages** (au-dessus des heatmaps, mémorisés sur l'appareil) : période 1 h / 24 h / 7 j (crypto), top 25 / 50 / 100, devise $ / €. En euros, les montants en dollars sont convertis au taux EUR/USD de `/api/fx` (Yahoo Finance, repli BCE), affiché à l'écran avec sa source et son heure ; sans taux, l'app reste en dollars. Les cours non libellés en dollars (KRW, SAR…) restent dans leur devise.
- **Favoris** : étoile ☆ dans l'écran graphique d'une crypto, d'une entreprise ou d'un indice ; onglet ★ Favoris avec des cartes (cours, variation, statut). Stockés sur l'appareil uniquement.
- **Alertes de prix** : cloche 🔔 dans l'écran graphique → seuil (dans la devise de la source) ; notification push quand il est franchi (vérification toutes les 5 min environ, alerte unique). Liste et suppression dans l'onglet Favoris, bouton « Tout supprimer ». Voir [`supabase/README.md`](supabase/README.md).
- **Compte de démonstration (papertrading)** — onglet Compte : capital fictif au choix (1 000, 10 000 ou 100 000 $), achat (long) ou vente à découvert (short) de cryptos, d'actions de toutes les places et d'indices. Le compte est en dollars : les actifs cotés dans une autre devise sont convertis au taux du moment (`/api/fx`, 28 devises, Yahoo Finance avec repli BCE). Pour un indice, 1 unité = 1 point dans la devise de l'indice, comme un CFD. Marché fermé : un ordre au marché s'exécute au dernier cours connu, avec un avertissement. Ordres au marché, à cours limité ou stop, levier 1× à 10× (marge isolée, prix de liquidation), take profit et stop loss avec gain ou perte estimés et ratio rendement/risque, frais simulés de 0,1 %. L'onglet affiche les positions avec leur P&L en direct, les ordres en attente, l'historique, les statistiques (taux de réussite, gains et pertes moyens…) et la courbe de la valeur du compte. On peut modifier le TP et le SL, ou clôturer à 25, 50 ou 100 %. Le moteur (`public/assets/paper.js`) s'exécute sur l'appareil à chaque rafraîchissement des données ; il n'exécute jamais rien sur un cours absent ou ancien, ni sans taux de change. La liquidation se déclenche quand la perte en dollars, change compris, atteint la marge. Tout est stocké localement (`marches:paper`).
- **Graphique « Trading (démo) »** : dans l'écran graphique d'une crypto ou d'une action en dollars, le sélecteur « TradingView | Trading (démo) » affiche un graphique en bougies (5 min, 15 min, 1 h, 4 h, 1 j ; via `/api/candles` : Yahoo Finance, repli CoinGecko). Il montre les lignes d'entrée (avec le P&L), de TP, de SL, de liquidation et des ordres en attente. Les lignes TP et SL se déplacent au doigt ; un toucher sur le graphique propose d'acheter ou de vendre à ce prix (ordre limite ou stop choisi automatiquement), de placer le TP ou le SL, ou de créer une alerte. Le graphique utilise [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/) v5.2.1 (Apache 2.0), copié dans `public/vendor/` avec sa licence : aucun appel à TradingView, donc pas de consentement à demander. Le logo d'attribution est affiché sur le graphique et le crédit figure dans les mentions légales.
- **Indices** : un seul onglet avec un sélecteur de région (Amériques, Europe, Asie, Afrique). Les anciens liens `#europe`, `#asie`… restent valides.
- **Image à télécharger** : sous les heatmaps Crypto et Actions, le bouton « Télécharger l’image » crée une image PNG 1080 × 1350 (heatmap, statistiques, date, sources et avertissement), dessinée sur l’appareil. On peut la télécharger, la partager (iPhone, Android) ou l’enregistrer par appui long. Rien n’est envoyé à un tiers : les logos passent par le relais `/api/logo`.
- **Indices du monde entier** (42 indices, 4 onglets) : Amériques (USA, Canada, Brésil, Mexique, Argentine), Europe (zone euro, France, Allemagne, Royaume-Uni, Espagne, Italie, Pays-Bas, Suisse, Belgique, Portugal, Autriche, Suède, Norvège, Pologne, Turquie), Asie-Pacifique (Chine, Hong Kong, Japon, Corée du Sud, Taïwan, Inde, Singapour, Indonésie, Malaisie, Thaïlande, Australie, Nouvelle-Zélande), Afrique & Moyen-Orient (Arabie saoudite, Israël, Afrique du Sud, Égypte). Chaque tuile : niveau, variation du jour, statut du marché, courbe de séance. Données figées chez la source (> 7 jours) : variation « n/d » et mention « Données anciennes ».
- **Graphiques TradingView** : un appui sur une tuile ouvre le graphique. Quand l'indice officiel est bloqué dans le widget gratuit, on affiche un CFD ou un ETF qui le suit (mention à l'écran) ; BIST 100, SET, NZX 50 et TASI n'ont aucun équivalent intégrable : seul le lien « Ouvrir dans TradingView » est proposé.
- Bouton rafraîchir, tirer-pour-rafraîchir, rafraîchissement automatique toutes les 60 s quand l'app est visible, balayage gauche/droite entre onglets.
- Hors ligne : la coquille de l'app et les dernières données restent en cache (service worker + localStorage), avec une bannière qui donne l'heure des données.
- Une donnée indisponible s'affiche « n/d ». Aucune valeur n'est jamais inventée.

**Mises à jour de l'app installée** : le service worker cherche une nouvelle version à chaque retour au premier plan et toutes les 15 minutes, puis recharge l'app une fois. La version (`APP_VERSION` dans `app.js`, `VERSION` dans `sw.js`) est affichée en bas de page.

## Architecture

```
public/            Front statique (HTML/CSS/JS vanilla, aucune dépendance)
  index.html       Balises PWA + iOS
  assets/app.js    Treemap « squarified », tuiles, gestes, rafraîchissement
  assets/          app.js, i18n.js, paper.js, tradechart.js, snapshot.js, consent.js, styles.css…
  sw.js            Service worker (coquille en cache, API network-first)
  manifest.webmanifest
  icons/           192/512, maskable, apple-touch-icon (générés par scripts/make-icons.mjs)
api/               Fonctions serverless Vercel (proxy + cache)
  crypto.js        CoinGecko → repli CoinPaprika (stablecoins exclus)
  tv.js            Trouve le symbole TradingView d'une crypto (cache 24 h)
  stocks.js        Top 25 entreprises : companiesmarketcap.com (classement) + Yahoo (cours)
  _yahoo.js        Appels Yahoo partagés (spark groupé, chart, statut de marché)
  logo.js          Relais des logos (protection de l'IP des visiteurs)
  indices.js       Yahoo Finance spark groupé (v7 + v8, 20 symboles/appel) → chart par indice → Stooq
  fx.js            Taux EUR/USD : Yahoo Finance → repli BCE (cache 10 min)
  alerts.js        Relais POST vers la fonction Supabase des alertes (même origine, IP non transmise)
  _lib.js          Cache mémoire + en-têtes CDN
supabase/          Service d'alertes de prix (voir supabase/README.md)
  migrations/      Schéma privé `marches`, tâche planifiée pg_cron (5 min)
  functions/alerts Fonction Edge : appareils, alertes, vérification des cours, Web Push (VAPID + RFC 8291)
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

## Conformité (RGPD, cookies, LCEN)

- Pages : `mentions-legales.html`, `confidentialite.html`, `cookies.html` (gestion des choix), `cgu.html` — en français, anglais (`/en/`) et chinois (`/zh/`), générées par `scripts/legal-pages.py`, liées dans le pied de page.
- Langues de l'app : français, anglais, chinois simplifié (`public/i18n.js`, sélecteur en haut à droite).
- Aucun cookie ; stockage local strictement nécessaire (exempté) ; le widget TradingView n'est chargé qu'après consentement (`public/consent.js`, choix conservé 6 mois, retirable).
- Logos relayés par `api/logo.js` (aucune IP de visiteur envoyée aux CDN tiers) ; en-têtes de sécurité (CSP, etc.) dans `vercel.json`.
- Rapport d'audit et informations restant à fournir : [`docs/AUDIT-CONFORMITE.md`](docs/AUDIT-CONFORMITE.md).

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
