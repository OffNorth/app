-- Sauvegarde quotidienne des données du bot (comptes simulés, trades, apprentissage de l'IA, jeu), compressée.
-- Lecture ET écriture réservées à la clé du bot (empreinte SHA-256 seulement ; la clé est dérivée du token Telegram
-- du bot, qui survit à une perte des données du serveur). RLS active, aucune politique : seule la fonction « bot » y accède.
create table if not exists marches.bot_backup (
  id text primary key check (id in ('daily', 'previous')),
  key_hash text not null,
  data text not null,
  files int not null default 0,
  bytes int not null default 0,
  version text,
  updated_at timestamptz not null default now()
);
alter table marches.bot_backup enable row level security;
