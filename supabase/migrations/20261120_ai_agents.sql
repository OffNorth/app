-- Agents IA (Claude) qui tradent des comptes de démonstration (argent fictif) : agents, décisions, tâche planifiée.
-- Les comptes des agents sont des comptes démo ordinaires (marches.paper_accounts, is_agent = true) : la tâche « alerts »
-- exécute déjà leurs ordres, take profit et stop loss toutes les 5 minutes.
alter table marches.paper_accounts add column if not exists is_agent boolean not null default false;

create table if not exists marches.ai_agents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,32}$'),
  name text not null,
  model text not null,
  effort text not null default 'medium' check (effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  cadence_min integer not null default 360 check (cadence_min between 30 and 10080),
  enabled boolean not null default true,
  account_id uuid not null references marches.paper_accounts(id) on delete cascade,
  next_run_at timestamptz not null default now(),
  pending_batch_id text,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists marches.ai_decisions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references marches.ai_agents(id) on delete cascade,
  at timestamptz not null default now(),
  status text not null check (status in ('submitted', 'applied', 'refused', 'error')),
  batch_id text,
  model text,
  prompt_chars integer,
  summary text check (summary is null or length(summary) <= 400),
  orders jsonb,
  executed jsonb,
  rejected jsonb,
  input_tokens integer,
  output_tokens integer,
  cost_usd double precision
);
create index if not exists ai_decisions_agent_at on marches.ai_decisions (agent_id, at desc);
create index if not exists ai_decisions_month on marches.ai_decisions (at);

alter table marches.ai_agents enable row level security;
alter table marches.ai_decisions enable row level security;
revoke all on marches.ai_agents, marches.ai_decisions from public, anon, authenticated;

-- Secret de la tâche planifiée (généré dans la base, jamais dans le code).
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'agents_cron_secret', 'Appel planifié de la fonction agents (action tick)')
where not exists (select 1 from vault.secrets where name = 'agents_cron_secret');

-- Passage toutes les 5 minutes (les envois n'ont lieu que si AGENTS_ENABLED=true et sous le plafond mensuel).
select cron.schedule(
  'marches-agents-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://glvxxxoxcxsxdnbofgqf.supabase.co/functions/v1/agents?action=tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agents-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agents_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
