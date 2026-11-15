# Service d'alertes de prix (Supabase)

- Projet Supabase `marches`, région `eu-west-3` (Paris), offre gratuite.
- `migrations/` : schéma privé `marches` (tables `devices`, `alerts`) et tâche planifiée `pg_cron` toutes les 5 minutes.
- `functions/alerts/` : fonction Edge (Deno) appelée par le relais `/api/alerts` du site et par la tâche planifiée.
  - `webpush.js` : Web Push sans dépendance (chiffrement RFC 8291, authentification VAPID RFC 8292, WebCrypto).
  - Déploiement : `supabase functions deploy alerts --no-verify-jwt` (la fonction fait sa propre authentification).

## Secrets

Aucun secret n'est dans ce dépôt. Ils sont tous dans **Supabase Vault** :
- `alerts_cron_secret` : généré dans la base par la migration, lu par la tâche planifiée et par la fonction ;
- `vapid_public_key`, `vapid_private_jwk` : clés VAPID générées par la fonction à son premier appel.

La fonction lit la base avec `SUPABASE_DB_URL`, variable fournie automatiquement par Supabase.
Côté Vercel, `ALERTS_FUNCTION_URL` (facultatif) remplace l'adresse par défaut de la fonction.
