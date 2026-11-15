-- Alertes de prix de l'app Marchés (projet Supabase « marches », région eu-west-3).
-- Schéma privé (non exposé par l'API REST) : seule la fonction Edge « alerts » y accède.
create schema if not exists marches;
revoke all on schema marches from public, anon, authenticated;

create table marches.devices (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,             -- SHA-256 du jeton aléatoire gardé par l'appareil
  endpoint text not null,                      -- adresse d'abonnement du service push du navigateur
  p256dh text not null,
  auth text not null,
  lang text not null default 'fr' check (lang in ('fr', 'en', 'zh')),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table marches.alerts (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references marches.devices(id) on delete cascade,
  kind text not null check (kind in ('c', 's', 'i')),            -- crypto, entreprise, indice
  asset_id text not null check (length(asset_id) between 1 and 64),
  label text not null check (length(label) between 1 and 64),
  direction text not null check (direction in ('above', 'below')),
  target double precision not null check (target > 0),
  currency text check (currency is null or length(currency) <= 8),
  created_at timestamptz not null default now(),
  triggered_at timestamptz,
  triggered_price double precision
);
create index alerts_device_idx on marches.alerts (device_id);
create index alerts_active_idx on marches.alerts (kind) where triggered_at is null;

alter table marches.devices enable row level security;
alter table marches.alerts enable row level security;
revoke all on all tables in schema marches from public, anon, authenticated;

-- Secret partagé entre la tâche planifiée et la fonction : généré ici, jamais affiché ni versionné.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'alerts_cron_secret', 'Appel planifié de la fonction alerts (action check)')
where not exists (select 1 from vault.secrets where name = 'alerts_cron_secret');
