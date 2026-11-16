-- Alertes : matières premières / devises (kind 'm') et alertes en variation % (metric 'pct').
alter table marches.alerts drop constraint if exists alerts_kind_check;
alter table marches.alerts add constraint alerts_kind_check check (kind in ('c', 's', 'i', 'm'));
alter table marches.alerts add column if not exists metric text not null default 'price';
alter table marches.alerts add constraint alerts_metric_check check (metric in ('price', 'pct'));
alter table marches.alerts drop constraint if exists alerts_target_check;
alter table marches.alerts add constraint alerts_target_check check (metric = 'pct' or target > 0);

-- Comptes de démonstration synchronisés (facultatif) : exécution des ordres côté serveur, multi-appareils, classement.
create table if not exists marches.paper_accounts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,               -- SHA-256 du code de synchronisation gardé par les appareils
  data jsonb not null,                           -- compte (liquidités, positions, ordres, historique, courbe)
  pseudo text check (pseudo is null or length(pseudo) between 2 and 20),
  equity double precision,
  pnl_pct double precision,
  trades integer not null default 0,
  rev integer not null default 1,                -- révision, pour éviter d'écraser une modification plus récente
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists marches.paper_devices (
  account_id uuid not null references marches.paper_accounts(id) on delete cascade,
  device_id uuid not null references marches.devices(id) on delete cascade,
  primary key (account_id, device_id)
);
create table if not exists marches.paper_groups (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  name text not null check (length(name) between 2 and 30),
  created_at timestamptz not null default now()
);
create table if not exists marches.paper_members (
  group_code text not null references marches.paper_groups(code) on delete cascade,
  account_id uuid not null references marches.paper_accounts(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_code, account_id)
);
alter table marches.paper_accounts enable row level security;
alter table marches.paper_devices enable row level security;
alter table marches.paper_groups enable row level security;
alter table marches.paper_members enable row level security;
revoke all on all tables in schema marches from public, anon, authenticated;
