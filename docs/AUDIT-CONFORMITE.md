# Audit de conformité légale — Marchés

Date : 15 novembre 2026. Site audité : https://marches-eight.vercel.app (dépôt `OffNorth/app`).

> Ce rapport est une analyse technique et documentaire. Il ne remplace pas l'avis d'un avocat ; les points marqués « validation juridique » doivent être confirmés par un professionnel du droit.

## 1. Activité réelle du site (base de l'analyse)

- Application web (PWA) gratuite d'information sur les marchés : cryptomonnaies, entreprises cotées, indices.
- **Aucun** compte, formulaire, paiement, vente, abonnement, publicité, newsletter, ni outil de mesure d'audience.
- Données de marché récupérées **côté serveur** (fonctions Vercel) auprès de CoinGecko, CoinPaprika, Yahoo Finance et companiesmarketcap.com. Le navigateur du visiteur ne contacte pas ces fournisseurs.
- Un seul contenu tiers intégré : les graphiques **TradingView** (iframe).
- Hébergement : Vercel Inc. (États-Unis).

**Ne s'appliquent pas** : CGV, droit de rétractation, informations sur les prix, la livraison et le paiement, règles sur la prospection et les newsletters, gestion de comptes et de mots de passe, suppression de compte.

## 2. État avant l'audit (constats mesurés)

| Point | Constat | Statut |
|---|---|---|
| HTTPS | Redirection 308 HTTP→HTTPS, HSTS `max-age=63072000; includeSubDomains; preload` | Conforme |
| Cookies | Aucun cookie déposé (vérifié dans le navigateur, y compris après ouverture de TradingView) | Conforme |
| Mentions légales | Absentes | **Non conforme** (LCEN art. 1-1) |
| Politique de confidentialité | Absente | **Non conforme** (RGPD art. 13) |
| TradingView | iframe chargée au toucher d'une tuile, **sans information ni consentement**. Le widget écrit dans le stockage local (`tradingview-widget.*`) et contacte 7 domaines TradingView ; sa politique indique qu'il collecte des « analytics information » | **Non conforme** (art. 82 loi Informatique et Libertés) |
| Logos | Chargés directement depuis `coin-images.coingecko.com` et `companiesmarketcap.com` dès l'ouverture : l'IP des visiteurs part chez des tiers sans information | **À corriger** (minimisation, transparence) |
| Stockage local du site | Cache des données, onglet affiché, masquage de l'aide à l'installation | Exempté de consentement, mais non documenté |
| En-têtes de sécurité | Pas de CSP, ni d'anti-clickjacking, ni de Permissions-Policy | À améliorer |
| API | `Access-Control-Allow-Origin: *` (n'importe quel site pouvait utiliser l'API) | À améliorer |
| Attribution CoinGecko | Exigée par les conditions de l'API gratuite ; crédit présent mais sans lien | À améliorer |
| Service worker | Bug : chaque page visitée écrasait la copie de l'accueil en cache, et hors ligne toute page renvoyait l'accueil | Bug corrigé |
| Accessibilité | Cartes d'indices non activables au clavier, focus peu visible | À améliorer (non obligatoire, voir §5) |

## 3. Modifications effectuées

1. **Pages juridiques** créées et liées dans le pied de page de l'app :
   - `mentions-legales.html` : éditeur, directeur de la publication, hébergeur, contact, droit de réponse, nature du service, sources, propriété intellectuelle ;
   - `confidentialite.html` : responsable, tableau données / finalités / bases légales / durées, destinataires, transferts hors UE, droits, CNIL, sécurité, mineurs ;
   - `cookies.html` : gestion des choix (accepter, refuser, retirer, effacer), inventaire du stockage exempté, traceurs tiers ;
   - `cgu.html` : objet, accès, absence de conseil en investissement, responsabilité, services tiers, propriété intellectuelle, droit applicable.
2. **Consentement TradingView** (`public/consent.js`), conforme aux recommandations de la CNIL :
   - rien n'est chargé chez TradingView avant un choix explicite ;
   - « Refuser » et « Accepter » ont la même taille, la même couleur et la même graisse ;
   - le choix est conservé 6 mois puis redemandé, et la navigation ne vaut jamais accord ;
   - retrait possible à tout moment (page Gestion des cookies) ;
   - preuve : enregistrement horodaté sur l'appareil (date, version, choix), le code du mécanisme étant versionné dans Git.
3. **Relais des logos** (`api/logo.js`). Les images passent par le serveur du site : aucune IP de visiteur n'est transmise aux CDN tiers. Sécurité : https seulement, liste blanche de domaines, aucune redirection suivie, type image obligatoire, 300 Ko maximum, CSP sandbox sur la réponse.
4. **En-têtes de sécurité** (`vercel.json`) : Content-Security-Policy stricte (scripts du site uniquement, iframes limitées à TradingView, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
5. **API** : suppression de l'en-tête CORS `*` ; l'API ne sert plus que l'app elle-même.
6. **Attributions** : « Powered by CoinGecko » avec lien, liens vers les autres sources.
7. **Accessibilité** : cartes d'indices activables au clavier (Entrée ou Espace) avec libellé ARIA, focus visible.
8. **Service worker** : chaque page est mise en cache sous sa propre adresse, et les pages juridiques sont disponibles hors ligne.

## 4. Vérifications réalisées après modifications

Navigateur Chromium, iPhone émulé, profil vierge. Testé en local puis en production :

- Au chargement : **0 requête vers un tiers, 0 cookie**.
- Ouverture d'un graphique : bandeau de consentement affiché, **0 requête TradingView avant le choix**.
- Refus : pas d'iframe, 0 requête TradingView ; preuve enregistrée, par exemple `{"v":1,"date":"…","choices":{"tradingview":false}}`.
- Accord : graphique chargé.
- Retrait depuis la page Cookies : graphique de nouveau bloqué. La réinitialisation provoque une nouvelle demande.
- Clavier : une carte d'indice s'ouvre avec Entrée.
- Pages juridiques : réponse 200, aucune erreur console ni violation de CSP. La page Mentions légales s'affiche hors ligne.

## 5. Obligations : statut final

| Obligation | Source | Statut |
|---|---|---|
| Identification de l'éditeur et de l'hébergeur | LCEN art. 1-1 (issu de la loi SREN 2024-449) | Page créée, **informations éditeur à fournir** |
| Information RGPD | RGPD art. 12-14 | Respecté (champs de contact à compléter) |
| Base légale de chaque traitement | RGPD art. 6 | Respecté |
| Transferts hors UE | RGPD art. 44-46 | Vercel : adhésion au Data Privacy Framework (décision d'adéquation du 10/07/2023). TradingView : **mécanisme à vérifier** |
| Droits des personnes, contact CNIL | RGPD art. 15-22, 77 | Respecté (adresse de contact à fournir) |
| Consentement aux traceurs non exemptés | Loi IL art. 82, lignes directrices et recommandation CNIL | Respecté (TradingView) |
| Traceurs exemptés documentés | CNIL | Respecté (page Cookies) |
| Sécurité des données | RGPD art. 32 | Respecté au regard des données traitées (HTTPS, HSTS, CSP, API en lecture seule, aucune donnée personnelle stockée côté serveur) |
| Minimisation | RGPD art. 5.1.c | Respecté (aucune collecte ; logos relayés) |
| CGV, rétractation, prix et livraison | Code de la consommation | **Non applicable** (aucune vente) |
| Newsletters, prospection | CPCE L34-5 | **Non applicable** |
| Accessibilité (directive (UE) 2019/882, depuis le 28/06/2025) | DGCCRF | Vise les services aux consommateurs couverts (commerce électronique, banque…), et exempte les microentreprises prestataires de services. A priori **non applicable** à ce site gratuit sans vente (**validation juridique**). Améliorations de base faites. |
| RGAA | Loi 2005-102 art. 47 | Non applicable (organismes publics, et entreprises à partir de 250 M€ de chiffre d'affaires) |
| Mineurs | Loi IL art. 45 | Pas de collecte ; mention de l'âge de 15 ans pour le consentement à TradingView |

## 6. Informations à fournir par l'éditeur

1. Statut : **particulier (non professionnel)** ou **professionnel** (micro-entreprise, société, association).
   - Si particulier : vous pouvez rester anonyme, à condition d'avoir communiqué votre identité à Vercel (LCEN art. 1-1 II).
2. Nom et prénom, ou dénomination ; adresse ; téléphone ; e-mail.
3. Si professionnel : SIREN/SIRET, RCS ou RNE, forme juridique, capital, n° de TVA intracommunautaire.
4. Nom du directeur de la publication.
5. Adresse e-mail de contact (droits RGPD, signalements, droit de réponse).
6. Durée de conservation des e-mails reçus.
7. Téléphone de l'hébergeur : non publié dans les documents juridiques de Vercel, à demander à Vercel. Il est exigé pour un éditeur professionnel.

Les emplacements sont signalés sur le site par des champs surlignés « [À COMPLÉTER] ».

## 7. Points nécessitant une validation juridique

1. **Droits de réutilisation des données** (risque principal) :
   - **Yahoo Finance** : endpoints non officiels ; leurs conditions limitent l'usage à un cadre personnel et non commercial ;
   - **companiesmarketcap.com** : CSV public, conditions à vérifier ;
   - **CoinGecko** : offre gratuite soumise à attribution (faite) et à ses conditions d'API.

   Une redistribution publique peut nécessiter une licence.
2. Applicabilité de la **directive Accessibilité** à ce service gratuit, selon le statut de l'éditeur.
3. **TradingView** :
   - vérifier sa qualification (responsable indépendant ou responsable conjoint au sens de CJUE, *Fashion ID*, C-40/17) et son mécanisme de transfert hors UE ;
   - vérifier les conditions d'utilisation des widgets (attribution).
4. **Preuve du consentement** : elle est conservée sur l'appareil, avec un code versionné. À confirmer comme suffisante au regard de l'art. 7.1 RGPD, sachant qu'aucune donnée ne remonte au serveur.
5. Contenu informatif financier : absence de « recommandation d'investissement » au sens du règlement (UE) 596/2014 (MAR) ; mentions « pas un conseil » présentes.

## 8. Sources consultées

- LCEN (loi 2004-575), art. 1-1 issu de l'art. 48 de la loi SREN 2024-449 — legifrance.gouv.fr
- economie.gouv.fr — « Mentions sur votre site internet : les obligations à respecter »
- CNIL — lignes directrices et recommandation « cookies et autres traceurs » (délib. 2020-091 et 2020-092, recommandation modifiée en décembre 2025) ; FAQ ; page de contact (3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 — 01 53 73 22 22)
- DGCCRF — directive « Accessibilité » : obligations depuis le 28/06/2025 et exemptions
- Vercel — Privacy Notice (adhésion au DPF), Terms, documentation sur la rétention des logs (Hobby : 1 h)
- TradingView — Privacy Policy (« TradingView is the data controller », collecte d'« analytics information » via les widgets)
- CoinGecko — conditions de l'offre gratuite (attribution requise)
