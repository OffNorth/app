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
