-- État en direct du bot de paper trading (comptes FTMO / Lucid simulés, positions, trades), publié par le bot
-- (fonction Edge « bot », action put) et lu par la catégorie « Bot » du site (action get, publique).
-- Une ligne par emplacement : « main » (le bot), « test » (essais). Écriture réservée à la clé enregistrée au 1er envoi
-- (empreinte SHA-256 seulement). RLS active, aucune politique : seule la fonction (SUPABASE_DB_URL) y accède.
create table if not exists marches.bot_live (
  slot text primary key check (slot in ('main', 'test')),
  key_hash text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table marches.bot_live enable row level security;
