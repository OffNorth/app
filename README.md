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
- **Décompte d'ouverture des bourses** : en haut de l'onglet Indices, un panneau « Ouverture des bourses » liste 15 grandes places, triées par prochain événement (« Ferme dans 1 h 09 », « Ouvre dans 59 min 06 s »). Le décompte apparaît aussi sur chaque carte d'indice, dans le bloc Wall Street des Actions, dans les favoris et dans le ticket d'ordre quand le marché est fermé ; il avance chaque seconde. Il s'appuie sur la séance du jour donnée par Yahoo (`currentTradingPeriod`). Au-delà, la prochaine ouverture est calculée au prochain jour de séance à la même heure locale (heure d'été comprise), en sautant week-ends et jours fériés connus (voir « Jours fériés »).
- **Indices** : un seul onglet avec un sélecteur de région (Amériques, Europe, Asie, Afrique). Les anciens liens `#europe`, `#asie`… restent valides.
- **Image à télécharger** : sous les heatmaps Crypto et Actions, le bouton « Télécharger l’image » crée une image PNG 1080 × 1350 (heatmap, statistiques, date, sources et avertissement), dessinée sur l’appareil. On peut la télécharger, la partager (iPhone, Android) ou l’enregistrer par appui long. Rien n’est envoyé à un tiers : les logos passent par le relais `/api/logo`.
- **Indices du monde entier** (42 indices, 4 onglets) : Amériques (USA, Canada, Brésil, Mexique, Argentine), Europe (zone euro, France, Allemagne, Royaume-Uni, Espagne, Italie, Pays-Bas, Suisse, Belgique, Portugal, Autriche, Suède, Norvège, Pologne, Turquie), Asie-Pacifique (Chine, Hong Kong, Japon, Corée du Sud, Taïwan, Inde, Singapour, Indonésie, Malaisie, Thaïlande, Australie, Nouvelle-Zélande), Afrique & Moyen-Orient (Arabie saoudite, Israël, Afrique du Sud, Égypte). Chaque tuile : niveau, variation du jour, statut du marché, courbe de séance. Données figées chez la source (> 7 jours) : variation « n/d » et mention « Données anciennes ».
- **Graphiques TradingView** : un appui sur une tuile ouvre le graphique. Quand l'indice officiel est bloqué dans le widget gratuit, on affiche un CFD ou un ETF qui le suit (mention à l'écran) ; BIST 100, SET, NZX 50 et TASI n'ont aucun équivalent intégrable : seul le lien « Ouvrir dans TradingView » est proposé.
- **Compte démo synchronisé (facultatif)** : un code secret aléatoire (seule son empreinte est stockée) retrouve le compte sur d'autres appareils. Le serveur (fonction Supabase `alerts`, toutes les 5 min) exécute ordres, TP et SL avec le même moteur (`public/assets/paper-engine.js`, copié dans `supabase/functions/alerts/`) même app fermée, et envoie une notification si on l'a demandé. Pseudo facultatif, groupes de classement (code à 6 caractères) avec performance et nombre de trades. Concurrence : révision (`rev`) et refus 409 avec la version actuelle.
- **Graphique de trading** : indicateurs MM20, MM50, volume, RSI 14 et MACD (12, 26, 9), cochés au choix (mémorisés).
- **Comparaison au marché** : dans l'onglet Compte, la courbe du compte est comparée au S&P 500 et au Bitcoin sur la même période (bougies réelles `/api/candles`, ramenées au capital de départ).
- **Partage d'une position** : bouton « Partager » sur une position ou une ligne d'historique → image PNG 1080 × 1080 (courbe réelle du cours, entrée, TP, SL, résultat), mention « argent fictif ».
- **Recherche** (loupe en haut) : n'importe quelle action ou ETF (Yahoo Finance) ou crypto (CoinGecko) via `/api/search` ; cours par `/api/quote` ; favoris, alertes et trading comme les autres actifs.
- **Matières premières et devises** : onglets « Matières » et « Devises » dans Indices (`/api/macro`, Yahoo Finance : or, argent, pétrole WTI et Brent, gaz naturel, cuivre, blé ; 8 paires de devises).
- **Agenda** (onglet Indices) : prochaines décisions de taux de la Fed et de la BCE, lues sur leurs pages officielles, et résultats des entreprises de plus de 20 Md$ sur 14 jours (calendrier Nasdaq) — `/api/calendar`.
- **Jours fériés** : le décompte saute week-ends et jours fériés de chaque place (`public/data/holidays.json`, généré par `scripts/holidays.py` avec la bibliothèque `exchange_calendars`, couverture indiquée par place) ; « ≈ » seulement quand les fériés sont inconnus.
- **Alertes en %** : dans la fiche d'alerte, choix « Prix » ou « Variation en % » (24 h pour une crypto, séance sinon).
- **Mode clair** : bouton en haut (automatique selon l'appareil → sombre → clair), `public/assets/theme.js`.
- **Heatmap par secteurs** : réglage « Entreprises | Secteurs » dans Actions ; secteurs de Yahoo Finance dans `public/data/sectors.json` (`node scripts/sectors.mjs`), variation de secteur pondérée par la capitalisation.
- **En bref** (onglet d'accueil) : indices clés, cryptos, or, pétrole et EUR/USD, places ouvertes, plus fortes variations, agenda, compte démo, favoris, outils (recherche, convertisseur, résumé quotidien).
- **Plus fortes hausses / baisses** sous les heatmaps Crypto et Actions.
- **Fiche détaillée** dans l'écran graphique (repliable) : plus haut / bas sur 52 semaines, performances 1 mois à 5 ans, RSI, position par rapport aux MM50 / MM200, volume, secteur, prochains résultats — calculés sur les bougies journalières réelles.
- **Comparer deux actifs** sur le graphique de trading (échelle en %).
- **Listes de favoris** (création, rangement, ordre, tri par variation ou par nom), mode « Organiser ».
- **Alertes techniques** (RSI 14, croisement MM20 / MM50, volume), calculées par le serveur sur bougies journalières (`indicators.js`, copie identique dans `supabase/functions/alerts/`).
- **Résumé quotidien** par notification, à l'heure choisie (favoris + compte démo synchronisé).
- **Compte démo** : stop suiveur, ordres liés (OCO), plusieurs comptes (5 au plus), notes sur les trades, journal (pire baisse, résultats par actif et par heure), export CSV, simulateur d'achats programmés (DCA), défi mensuel dans les groupes.
- **Tablette et ordinateur** : navigation latérale et contenu sur plusieurs colonnes à partir de 900 px.
- **Raccourcis** sur l'icône de l'app (En bref, Crypto, Compte, Rechercher) et **convertisseur** devises / cryptos.
- **Actualités** par actif (écran graphique, repliable) : titres Yahoo Finance avec lien vers l'article (`/api/news`).
- **Calendrier économique** (Nasdaq, heures converties de New York vers l'heure locale) et **dividendes** (dates de détachement des entreprises suivies et des favoris) dans l'agenda : `/api/econ`, `/api/dividends`.
- **Sentiment** (En bref) : Fear & Greed des cryptos (alternative.me) et VIX : `/api/sentiment`.
- **Carte du monde** des indices (région « Carte ») : `public/data/world.json`, généré par `scripts/worldmap.mjs` (Natural Earth, world-atlas).
- **Filtre d'actions** (Actions → Filtre) par secteur, pays, variation, tri ; **catégories de cryptos** (Crypto → Catégories, CoinGecko : `/api/cryptocats`).
- **Courbe des taux américains** (Indices → Taux) : rendements 3 mois, 5, 10 et 30 ans (indices CBOE via Yahoo Finance), comparés à il y a 1 mois et 1 an, écart 10 ans − 3 mois et signal d'inversion : `/api/rates`.
- **Performances** 1 semaine / 1 mois / depuis le 1er janvier / 1 an : tableau des indices d'une région (Indices → Performances), des favoris, et ligne « 1 semaine » dans la fiche.
- **Écran graphique → Analyses** : saisonnalité (variation moyenne de chaque mois sur 10 ans), simulateur d'investissement régulier sur les cours réels (bougies mensuelles `/api/candles?tf=1mo`) et **plan de trading** par actif (note, objectif, invalidation ; rappelé dans le ticket démo, « Utiliser comme TP / SL »).
- **Corrélations** des favoris (Favoris → Corrélations) : variations quotidiennes sur ~90 jours.
- **Réseau Bitcoin** (onglet Crypto) : compte à rebours estimé du halving, difficulté, frais, puissance de calcul (mempool.space) : `/api/btc`.
- **Repères sur le graphique de trading** (actions) : détachements de dividende (Yahoo Finance) et publications de résultats (Nasdaq) : `/api/events`.
- **Calculatrices** (En bref → Outils, et « Selon le risque » dans le ticket) : taille de position selon le % de risque, intérêts composés.
- **Portefeuille réel** : date d'achat facultative, courbe d'évolution reconstituée sur les clôtures réelles, dividendes reçus estimés.
- **Agents IA** (Compte → Agents IA) : 5 agents pilotés par Claude (Anthropic) gèrent chacun un compte de démonstration de 100 000 $ fictifs sur tous les marchés de l'app (Tendance, Contrarien, Macro, Crypto, Équilibré). Classement public, positions, courbe de valeur et journal des décisions avec leur explication ; comparaison avec votre compte démo faite sur l'appareil. Décisions générées par une IA, argent fictif, information et pas un conseil financier. Fonctionnement : fonction Supabase `agents` (voir `supabase/README.md`), relais en lecture `/api/agents`.
- **Formation NAS100** (`/formation.html`, `/en/formation.html`, `/zh/formation.html` ; En bref → Outils, lien sur le graphique Nasdaq 100 et dans le lexique) : formation de @Max en 7 modules et 30 jours (bases, analyse technique, TradingView, NAS100, 3 stratégies, risque, plan et journal), traduite en anglais et en chinois, PDF original dans `public/docs/formation-nas100.pdf`. Modules repliables, progression et checklist enregistrées sur l'appareil (`marches:formation`), bouton « Copier » du script Pine, calculatrices de taille de position et d'espérance, liens vers l'app (`/?go=ndx | demo | calc | taux | indices | gloss:<terme>`). Contenu dans `scripts/formation/content_{fr,en,zh}.py`, pages générées par `python3 scripts/formation-page.py`. Chiffres datés vérifiés le 17/11/2026 (tarifs TradingView, poids ChartRow) ; caractéristiques des contrats futures reprises du document.
- **Rappels du calendrier** (veille, 18 h) et **résumé de la semaine** (samedi, 10 h) par notification ; **bandeau défilant** des favoris ; **visite guidée** au premier lancement ; bandeau et notifications « hors ligne / connexion rétablie ».
- **Tableau de performances** des favoris : 1 j, 1 sem., 1 mois, depuis le 1er janvier, 1 an.
- **Tracés** sur le graphique de trading : horizontale, tendance, Fibonacci (mémorisés par actif).
- **Test de stratégie** (RSI, croisements MM20/50 et MM50/200) sur bougies journalières, comparé à l'achat-conservation.
- **Mon portefeuille réel** (Compte → Mon portefeuille) : saisie manuelle, valeur, plus-values, répartition, export CSV — uniquement sur l'appareil (`public/assets/portfolio.js`).
- **Alertes de forts mouvements** sur les favoris (seuil en %, une par actif et par jour).
- **Sauvegarde / restauration** du compte démo dans un fichier JSON.
- **Lexique** (`public/assets/glossary.js`) avec boutons « ? » ; **taille du texte** (90 à 130 %) ; audit d'accessibilité axe-core (WCAG 2.1 AA) sans violation sur tous les onglets.
- **Mode plein écran / TV** : heatmap seule, horloge, rotation Crypto / Actions, écran maintenu allumé.
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

Vercel déploie le dossier `public/` en statique et `api/*.js` en fonctions, sans étape de build. Le plan Hobby limite un déploiement à 12 fonctions : les flux en lecture (`news`, `sentiment`, `cryptocats`, `econ`, `dividends`, `calendar`, `macro`, `search`, `quote`, `rates`, `events`, `btc`, `agents`) sont des modules `api/_*.js` servis par une seule fonction, `api/feeds.js` ; les réécritures de `vercel.json` gardent leurs adresses `/api/<nom>` (le serveur local `scripts/dev-server.mjs` applique les mêmes). Les fichiers `api/_*.js` ne sont pas des fonctions.

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
