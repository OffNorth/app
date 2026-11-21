# Service d'alertes de prix (Supabase)

- Projet Supabase `marches`, région `eu-west-3` (Paris), offre gratuite.
- `migrations/` : schéma privé `marches` (tables `devices`, `alerts` ; comptes démo synchronisés `paper_accounts`, `paper_devices`, groupes de classement `paper_groups`, `paper_members`) et tâche planifiée `pg_cron` toutes les 5 minutes.
- Actions de la fonction : `config`, `register`, `list`, `create` (prix ; variation en % `metric: "pct"` ; techniques `rsi`, `ma`, `vol`), `summary.set` (résumé quotidien), `moves.set` (alertes de forts mouvements), `remind.set` (rappels du calendrier, la veille à 18 h locale), `weekly.set` (résumé de la semaine, samedi 10 h locale), `delete`, `forget` ; `paper.put` / `paper.get` / `paper.delete` / `paper.link` / `paper.pseudo` ; `group.create` / `group.join` / `group.leave` / `group.board` ; `check` (tâche planifiée seulement : alertes, puis exécution des comptes synchronisés avec `paper-engine.js`, copie conforme de `public/assets/paper-engine.js`).
- Conservation : alertes déclenchées 30 jours ; appareils inactifs 90 jours sans alerte ni compte lié ; comptes démo inutilisés 1 an ; groupes vides supprimés.
- `functions/alerts/` : fonction Edge (Deno) appelée par le relais `/api/alerts` du site et par la tâche planifiée.
  - `webpush.js` : Web Push sans dépendance (chiffrement RFC 8291, authentification VAPID RFC 8292, WebCrypto).
  - Déploiement : `supabase functions deploy alerts --no-verify-jwt` (la fonction fait sa propre authentification).

## Secrets

Aucun secret n'est dans ce dépôt. Ils sont tous dans **Supabase Vault** :
- `alerts_cron_secret` : généré dans la base par la migration, lu par la tâche planifiée et par la fonction ;
- `vapid_public_key`, `vapid_private_jwk` : clés VAPID générées par la fonction à son premier appel.

La fonction lit la base avec `SUPABASE_DB_URL`, variable fournie automatiquement par Supabase.
Côté Vercel, `ALERTS_FUNCTION_URL` (facultatif) remplace l'adresse par défaut de la fonction.


## Agents IA (fonction `agents`)
Cinq agents (Claude, Anthropic) tradent chacun un compte de démonstration (`marches.paper_accounts`, `is_agent = true`, 100 000 $ fictifs).
- **Tâche planifiée** `marches-agents-tick` (toutes les 5 min, secret `agents_cron_secret` dans Vault) : récupère les lots terminés de l'API Batches d'Anthropic, valide chaque ordre avec `rules.js` (actif connu et cours frais, marge ≤ 20 % du compte, 15 positions au plus, levier ≤ 2× avec stop loss obligatoire, marché fermé → ordre limite ou stop), l'exécute avec `paper-engine.js` (copie conforme de `public/assets/paper-engine.js`, comme pour `alerts`), puis envoie un nouveau lot pour les agents dont c'est l'heure (toutes les 6 h par défaut, colonne `cadence_min`). Les TP, SL et ordres en attente sont exécutés ensuite par la tâche `alerts`.
- **Instantané** (`snapshot.js`) : données réelles du site (cryptos, actions, indices, matières et devises, taux US, sentiment, agenda, RSI / moyennes mobiles sur bougies journalières), « n/d » pour toute donnée absente.
- **Modèle** : `claude-opus-5-5` par défaut (colonne `model` de `marches.ai_agents`), effort `medium`, sortie structurée (schéma `DECISION_SCHEMA`). Coût mesuré à chaque décision (`ai_decisions.cost_usd`).
- **Secrets et interrupteurs de la fonction** (Supabase → Edge Functions → Secrets, jamais dans le code) : `ANTHROPIC_API_KEY` (clé de l'API Anthropic), `AGENTS_ENABLED` (`true` pour activer les envois planifiés ; absent = aucun appel facturé), `AGENTS_MONTHLY_BUDGET_USD` (plafond mensuel, 30 par défaut : au-delà, plus aucun envoi).
- **Actions** : `board` (public, lecture seule, relayé par `/api/agents`), `tick`, `setup` (crée les agents et leurs comptes), `preview { slug }` (instantané sans appel facturé), `run { force: true }` (envoi immédiat, facturé) — toutes sauf `board` exigent l'en-tête `x-agents-secret`.
- Migration : `migrations/20261120_ai_agents.sql` (tables `ai_agents`, `ai_decisions`, RLS active, tâche planifiée).


## Bot de paper trading (fonction `bot`)
- Table `marches.bot_live` (migration `20261121_bot_live.sql`, RLS active, aucune politique) : état en direct du bot
  (comptes FTMO / Lucid simulés, positions avec entrée / SL / TP, derniers trades), publié par le bot (dépôt `idk`,
  `src/livePush.js`) toutes les 15 s environ.
- Actions : `get` (public, relayé par `/api/bot` pour la catégorie « Bot » du site), `put` (en-tête `x-bot-key` : clé
  générée par le bot ; empreinte SHA-256 enregistrée au 1er envoi, ensuite seule cette clé peut écrire). Emplacements
  `main` (le bot) et `test`. Remise à zéro : supprimer la ligne de l'emplacement.
- Déploiement : `supabase functions deploy bot --no-verify-jwt`.
